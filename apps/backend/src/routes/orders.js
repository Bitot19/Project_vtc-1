
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();
const prisma = new PrismaClient();

// ===== Tạo đơn hàng =====
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { orderItems } = req.body; 
    // orderItems = [{ productId, quantity }]

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ error: "Đơn hàng trống" });
    }

    // Lấy thông tin sản phẩm từ DB
    const productIds = orderItems.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== orderItems.length) {
      return res.status(400).json({ error: "Một số sản phẩm không tồn tại" });
    }

    // Tính tổng tiền
    let total = 0;
    const orderorderItems = orderItems.map((i) => {
      const product = products.find((p) => p.id === i.productId);
      total += product.price * i.quantity;
      return {
        productId: product.id,
        quantity: i.quantity,
        price: product.price,
      };
    });

    // Tạo order + orderorderItems
    const order = await prisma.order.create({
      data: {
        userId: req.user.id,
        total,
        orderItems: { create: orderorderItems },
      },
      include: { orderItems: true },
    });

    res.status(201).json({ message: "Tạo đơn hàng thành công", order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Lấy danh sách đơn hàng của user =====
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { orderItems: { include: { product: true } } },
    });
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Admin: Lấy tất cả đơn hàng =====
router.get("/", authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: "Bạn không có quyền" });
    }

    const orders = await prisma.order.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        orderItems: { include: { product: true } },
      },
    });

    res.json({ orders });
  } catch (err) {
    console.error(err);
       console.error("Lỗi khi lấy orders:", err); // In ra log
    res.status(500).json({ error: err.message }); // Log chi tiết phần lỗi
  }
});

// ===== Admin: Cập nhật trạng thái đơn hàng =====
router.put("/:id/status", authMiddleware, async (req, res) => {
  try {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: "Bạn không có quyền" });
    }

    const { status } = req.body; // pending, paid, shipped, cancelled
    const order = await prisma.order.update({
      where: { id: Number(req.params.id) },
      data: { status },
    });

    res.json({ message: "Cập nhật trạng thái thành công", order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});
// ===== Xoá đơn hàng =====
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.id);

    // Kiểm tra đơn hàng tồn tại
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    // Quyền xoá: admin hoặc chủ đơn hàng khi đơn còn pending
    if (!req.user.isAdmin && (order.userId !== req.user.id || order.status !== "pending")) {
      return res.status(403).json({ error: "Bạn không có quyền xoá đơn này" });
    }

    // Xoá các orderItem trước
    await prisma.orderItem.deleteMany({ where: { orderId } });
    // Xoá đơn
    await prisma.order.delete({ where: { id: orderId } });

    res.json({ message: "Xoá đơn hàng thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Update chi tiết item trong đơn hàng =====
router.put("/:orderId/orderItems/:itemId", authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const itemId = Number(req.params.itemId);
    const { productId, quantity } = req.body;

    // Kiểm tra đơn hàng
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    // Quyền sửa: admin hoặc chủ đơn hàng khi còn pending
    if (!req.user.isAdmin && (order.userId !== req.user.id || order.status !== "pending")) {
      return res.status(403).json({ error: "Bạn không có quyền sửa đơn này" });
    }

    // Kiểm tra item có thuộc order này không
    const orderItem = order.orderItems.find((i) => i.id === itemId);
    if (!orderItem) {
      return res.status(404).json({ error: "Không tìm thấy item trong đơn hàng" });
    }

    // Nếu đổi sản phẩm thì kiểm tra productId có tồn tại không
    if (productId) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return res.status(400).json({ error: "Sản phẩm không tồn tại" });
    }

    // Update item
    const updatedItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        productId: productId ?? orderItem.productId,
        quantity: quantity ?? orderItem.quantity,
      },
    });

    // Re-calc total
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId },
      include: { product: true },
    });

    const newTotal = orderItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

    await prisma.order.update({
      where: { id: orderId },
      data: { total: newTotal },
    });

    res.json({ message: "Cập nhật item thành công", item: updatedItem, newTotal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});


export default router;
