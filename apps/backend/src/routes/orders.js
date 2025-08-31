import { Router } from "express";
import { PrismaClient, OrderStatus } from "@prisma/client";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { staffMiddleware } from "../middleware/staffMiddleware.js";

const router = Router();
const prisma = new PrismaClient();

// ===== Tạo đơn hàng =====
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { customerName, phone, address, note, orderItems, voucherCode } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ error: "Đơn hàng trống" });
    }

    const variantIds = orderItems.map(i => i.productVariantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
    });

    if (variants.length !== orderItems.length) {
      return res.status(400).json({ error: "Một số biến thể sản phẩm không tồn tại" });
    }

    let totalPrice = 0;
    const orderItemsData = orderItems.map(i => {
      const variant = variants.find(v => v.id === i.productVariantId);
      totalPrice += variant.price * i.quantity;
      return {
        productVariantId: variant.id,
        quantity: i.quantity,
        price: variant.price,
      };
    });

    let voucher = null;
    if (voucherCode) {
      voucher = await prisma.voucher.findUnique({ where: { code: voucherCode } });
      if (!voucher || !voucher.isActive || voucher.quantity <= 0) {
        return res.status(400).json({ error: "Voucher không hợp lệ hoặc đã hết" });
      }
      totalPrice = Math.max(0, totalPrice - voucher.discount);
      await prisma.voucher.update({
        where: { id: voucher.id },
        data: { quantity: { decrement: 1 } },
      });
    }

    const order = await prisma.order.create({
      data: {
        userId: req.user.id,
        customerName,
        phone,
        address,
        note,
        totalPrice,
        status: OrderStatus.PENDING,
        voucherId: voucher ? voucher.id : null,
        orderItems: { create: orderItemsData },
      },
      include: {
        orderItems: { include: { productVariant: { include: { product: true } } } },
        voucher: true,
      },
    });

    res.status(201).json({ message: "Tạo đơn hàng thành công", order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Lấy danh sách đơn hàng của user =====
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: {
        orderItems: { include: { productVariant: { include: { product: true } } } },
        voucher: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Lấy tất cả đơn hàng (STAFF/ADMIN) =====
router.get("/", authMiddleware, staffMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        orderItems: { include: { productVariant: { include: { product: true } } } },
        voucher: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Cập nhật trạng thái đơn hàng =====
router.put("/:id/status", authMiddleware, staffMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = Number(req.params.id);

    if (!Object.values(OrderStatus).includes(status)) {
      return res.status(400).json({ error: "Trạng thái không hợp lệ" });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: { include: { productVariant: true } } },
    });

    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    // Trừ kho nếu từ PENDING -> PAID
    if (status === OrderStatus.PAID && order.status === OrderStatus.PENDING) {
      for (const item of order.orderItems) {
        if (item.productVariant.quantity < item.quantity) {
          return res.status(400).json({ error: `Biến thể ${item.productVariant.id} không đủ hàng` });
        }
        await prisma.productVariant.update({
          where: { id: item.productVariantId },
          data: { quantity: { decrement: item.quantity } },
        });
      }
    }

    // Trả kho nếu từ PAID -> CANCELLED
    if (status === OrderStatus.CANCELLED && order.status === OrderStatus.PAID) {
      for (const item of order.orderItems) {
        await prisma.productVariant.update({
          where: { id: item.productVariantId },
          data: { quantity: { increment: item.quantity } },
        });
      }
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: {
        orderItems: { include: { productVariant: { include: { product: true } } } },
        voucher: true,
      },
    });

    res.json({ message: "Cập nhật trạng thái thành công", order: updatedOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Xoá đơn hàng =====
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { orderItems: true } });

    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    const isOwner = order.userId === req.user.id;
    const isPending = order.status === OrderStatus.PENDING;

    if (!(req.user.role === "ADMIN" || req.user.role === "STAFF" || (isOwner && isPending))) {
      return res.status(403).json({ error: "Không có quyền xoá đơn này" });
    }

    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } });

    res.json({ message: "Xoá đơn hàng thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Thêm item vào đơn hàng =====
router.post("/:orderId/orderItems", authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { productVariantId, quantity } = req.body;

    if (!productVariantId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: "Thiếu productVariantId hoặc quantity không hợp lệ" });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    const isOwner = order.userId === req.user.id;
    const isPending = order.status === OrderStatus.PENDING;

    if (!(req.user.role === "ADMIN" || req.user.role === "STAFF" || (isOwner && isPending))) {
      return res.status(403).json({ error: "Không có quyền thêm item vào đơn này" });
    }

    const variant = await prisma.productVariant.findUnique({ where: { id: productVariantId } });
    if (!variant) return res.status(400).json({ error: "Biến thể sản phẩm không tồn tại" });

    const newItem = await prisma.orderItem.create({
      data: {
        orderId,
        productVariantId,
        quantity,
        price: variant.price,
      },
    });

    // Tính lại totalPrice
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId },
      include: { productVariant: true },
    });

    let newTotalPrice = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    if (order.voucherId) {
      const voucher = await prisma.voucher.findUnique({ where: { id: order.voucherId } });
      if (voucher && voucher.isActive) {
        newTotalPrice = Math.max(0, newTotalPrice - voucher.discount);
      }
    }

    await prisma.order.update({ where: { id: orderId }, data: { totalPrice: newTotalPrice } });

    res.status(201).json({ message: "Thêm item thành công", item: newItem, newTotalPrice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Update item trong đơn hàng =====
router.put("/:orderId/orderItems/:itemId", authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const itemId = Number(req.params.itemId);
    const { productVariantId, quantity } = req.body;

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { orderItems: true } });
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    const isOwner = order.userId === req.user.id;
    const isPending = order.status === OrderStatus.PENDING;
    if (!(req.user.role === "ADMIN" || req.user.role === "STAFF" || (isOwner && isPending))) {
      return res.status(403).json({ error: "Không có quyền sửa đơn này" });
    }

    const orderItem = order.orderItems.find(i => i.id === itemId);
    if (!orderItem) return res.status(404).json({ error: "Không tìm thấy item" });

    if (productVariantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: productVariantId } });
      if (!variant) return res.status(400).json({ error: "Biến thể sản phẩm không tồn tại" });
    }

    const updatedItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        productVariantId: productVariantId ?? orderItem.productVariantId,
        quantity: quantity ?? orderItem.quantity,
      },
    });

    const orderItems = await prisma.orderItem.findMany({
      where: { orderId },
      include: { productVariant: true },
    });

    let newTotalPrice = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    if (order.voucherId) {
      const voucher = await prisma.voucher.findUnique({ where: { id: order.voucherId } });
      if (voucher && voucher.isActive) newTotalPrice = Math.max(0, newTotalPrice - voucher.discount);
    }

    await prisma.order.update({ where: { id: orderId }, data: { totalPrice: newTotalPrice } });

    res.json({ message: "Cập nhật item thành công", item: updatedItem, newTotalPrice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Xoá item khỏi đơn hàng =====
router.delete("/:orderId/orderItems/:itemId", authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const itemId = Number(req.params.itemId);

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { orderItems: true } });
    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    const isOwner = order.userId === req.user.id;
    const isPending = order.status === OrderStatus.PENDING;
    if (!(req.user.role === "ADMIN" || req.user.role === "STAFF" || (isOwner && isPending))) {
      return res.status(403).json({ error: "Không có quyền xoá item" });
    }

    await prisma.orderItem.delete({ where: { id: itemId } });

    const orderItems = await prisma.orderItem.findMany({ where: { orderId }, include: { productVariant: true } });
    let newTotalPrice = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    if (order.voucherId) {
      const voucher = await prisma.voucher.findUnique({ where: { id: order.voucherId } });
      if (voucher && voucher.isActive) newTotalPrice = Math.max(0, newTotalPrice - voucher.discount);
    }

    await prisma.order.update({ where: { id: orderId }, data: { totalPrice: newTotalPrice } });

    res.json({ message: "Xoá item thành công", newTotalPrice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Lịch sử mua hàng của khách =====
router.get("/me/orders", authMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { orderItems: { include: { productVariant: { include: { product: true } } } }, voucher: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

export default router;




/*
import { Router } from "express";
import { PrismaClient, OrderStatus } from "@prisma/client";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { staffMiddleware } from "../middleware/staffMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = Router();
const prisma = new PrismaClient();

// ===== Tạo đơn hàng (user) =====
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { customerName, phone, address, note, orderItems, voucherCode } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ error: "Đơn hàng trống" });
    }

    // Lấy thông tin sản phẩm
    const productIds = orderItems.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== orderItems.length) {
      return res.status(400).json({ error: "Một số sản phẩm không tồn tại" });
    }

    // Tính tổng tiền
    let totalPrice = 0;
    const orderItemsData = orderItems.map((i) => {
      const product = products.find((p) => p.id === i.productId);
      totalPrice += product.price * i.quantity;
      return {
        productId: product.id,
        quantity: i.quantity,
        price: product.price,
      };
    });

    // Áp dụng voucher nếu có
    let voucher = null;
    if (voucherCode) {
      voucher = await prisma.voucher.findUnique({
        where: { code: voucherCode },
      });

      if (!voucher || !voucher.isActive || voucher.quantity <= 0) {
        return res.status(400).json({ error: "Voucher không hợp lệ hoặc đã hết" });
      }

      totalPrice = Math.max(0, totalPrice - voucher.discount);

      // Trừ số lượng voucher
      await prisma.voucher.update({
        where: { id: voucher.id },
        data: { quantity: { decrement: 1 } },
      });
    }

    // Tạo đơn hàng
    const order = await prisma.order.create({
      data: {
        userId: req.user.id,
        customerName,
        phone,
        address,
        note,
        totalPrice,
       status: OrderStatus.PENDING,
        voucherId: voucher ? voucher.id : null,
        orderItems: { create: orderItemsData },
      },
      include: { orderItems: true, voucher: true },
    });

    res.status(201).json({ message: "Tạo đơn hàng thành công", order });
  } catch (err) {
    console.error("Lỗi tạo order:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===== User: Lấy danh sách đơn hàng của chính mình =====
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { orderItems: { include: { product: true } }, voucher: true },
    });
    res.json({ orders });
  } catch (err) {
    console.error("Lỗi lấy đơn của user:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== STAFF hoặc ADMIN: Lấy tất cả đơn hàng =====
router.get("/", authMiddleware, staffMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        orderItems: { include: { product: true } },
        voucher: true,
      },
    });

    res.json({ orders });
  } catch (err) {
    console.error("Lỗi khi lấy orders:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== STAFF hoặc ADMIN: Cập nhật trạng thái đơn hàng =====
router.put("/:id/status", authMiddleware, staffMiddleware, async (req, res) => {
  try {
   const { status } = req.body;

// Kiểm tra hợp lệ
if (!Object.values(OrderStatus).includes(status)) {
  return res.status(400).json({ error: "Trạng thái không hợp lệ" });
}
    const orderId = Number(req.params.id);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: { include: { product: true } } },
    });

    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    // Nếu từ pending -> paid => trừ kho
    if (status === OrderStatus.PAID && order.status === OrderStatus.PENDING)  {
      for (const item of order.orderItems) {
        if (item.product.quantity < item.quantity) {
          return res.status(400).json({ error: `Sản phẩm ${item.product.name} không đủ hàng` });
        }
        await prisma.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }
    }

    // Nếu từ paid -> cancelled => trả kho
    if (status === OrderStatus.CANCELLED && order.status === OrderStatus.PAID) {
      for (const item of order.orderItems) {
        await prisma.product.update({
          where: { id: item.productId },
          data: { quantity: { increment: item.quantity } },
        });
      }
    }

    // Cập nhật trạng thái đơn hàng
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status },
    });

    res.json({ message: "Cập nhật trạng thái thành công", order: updatedOrder });
  } catch (err) {
    console.error("Lỗi cập nhật status:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});


// ===== Xoá đơn hàng (ADMIN, STAFF hoặc chủ đơn khi pending) =====
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.id);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    const isOwner = order.userId === req.user.id;
    const isPending = order.status === OrderStatus.PENDING;

    if (!(req.user.role === "ADMIN" || req.user.role === "STAFF" || (isOwner && isPending))) {
      return res.status(403).json({ error: "Bạn không có quyền xoá đơn này" });
    }

    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } });

    res.json({ message: "Xoá đơn hàng thành công" });
  } catch (err) {
    console.error("Lỗi xoá order:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Update chi tiết item trong đơn hàng (ADMIN, STAFF hoặc chủ đơn khi pending) =====
router.put("/:orderId/orderItems/:itemId", authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const itemId = Number(req.params.itemId);
    const { productId, quantity } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    const isOwner = order.userId === req.user.id;
    const isPending = order.status === OrderStatus.PENDING;

    if (!(req.user.role === "ADMIN" || req.user.role === "STAFF" || (isOwner && isPending))) {
      return res.status(403).json({ error: "Bạn không có quyền sửa đơn này" });
    }

    const orderItem = order.orderItems.find((i) => i.id === itemId);
    if (!orderItem) return res.status(404).json({ error: "Không tìm thấy item trong đơn hàng" });

    if (productId) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return res.status(400).json({ error: "Sản phẩm không tồn tại" });
    }

    const updatedItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        productId: productId ?? orderItem.productId,
        quantity: quantity ?? orderItem.quantity,
      },
    });

    // Tính lại totalPrice
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId },
      include: { product: true },
    });

    let newTotalPrice = orderItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

    // Nếu có voucher thì trừ tiếp
    if (order.voucherId) {
      const voucher = await prisma.voucher.findUnique({
        where: { id: order.voucherId },
      });
      if (voucher && voucher.isActive) {
        newTotalPrice = Math.max(0, newTotalPrice - voucher.discount);
      }
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { totalPrice: newTotalPrice },
    });

    res.json({ message: "Cập nhật item thành công", item: updatedItem, newTotalPrice });
  } catch (err) {
    console.error("Lỗi update item:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});
// ===== Thêm item vào đơn hàng =====
router.post("/:orderId/orderItems", authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const { productId, quantity } = req.body;

    if (!productId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: "Thiếu productId hoặc quantity không hợp lệ" });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    const isOwner = order.userId === req.user.id;
    const isPending = order.status === OrderStatus.PENDING;

    if (!(req.user.role === "ADMIN" || req.user.role === "STAFF" || (isOwner && isPending))) {
      return res.status(403).json({ error: "Bạn không có quyền thêm item vào đơn này" });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(400).json({ error: "Sản phẩm không tồn tại" });

    // Tạo orderItem mới
    const newItem = await prisma.orderItem.create({
      data: {
        orderId,
        productId,
        quantity,
        price: product.price,
      },
    });

    // Tính lại totalPrice
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId },
      include: { product: true },
    });

    let newTotalPrice = orderItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

    if (order.voucherId) {
      const voucher = await prisma.voucher.findUnique({ where: { id: order.voucherId } });
      if (voucher && voucher.isActive) {
        newTotalPrice = Math.max(0, newTotalPrice - voucher.discount);
      }
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { totalPrice: newTotalPrice },
    });

    res.status(201).json({ message: "Thêm item thành công", item: newItem, newTotalPrice });
  } catch (err) {
    console.error("Lỗi thêm item:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});


// ===== Xoá item khỏi đơn hàng =====
router.delete("/:orderId/orderItems/:itemId", authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const itemId = Number(req.params.itemId);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng" });

    const isOwner = order.userId === req.user.id;
    const isPending = order.status === OrderStatus.PENDING;

    if (!(req.user.role === "ADMIN" || req.user.role === "STAFF" || (isOwner && isPending))) {
      return res.status(403).json({ error: "Bạn không có quyền xoá item trong đơn này" });
    }

    const orderItem = order.orderItems.find((i) => i.id === itemId);
    if (!orderItem) return res.status(404).json({ error: "Không tìm thấy item trong đơn hàng" });

    await prisma.orderItem.delete({ where: { id: itemId } });

    // Tính lại totalPrice
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId },
      include: { product: true },
    });

    let newTotalPrice = orderItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

    if (order.voucherId) {
      const voucher = await prisma.voucher.findUnique({ where: { id: order.voucherId } });
      if (voucher && voucher.isActive) {
        newTotalPrice = Math.max(0, newTotalPrice - voucher.discount);
      }
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { totalPrice: newTotalPrice },
    });

    res.json({ message: "Xoá item thành công", newTotalPrice });
  } catch (err) {
    console.error("Lỗi xoá item:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});
// Khách hàng xem lịch sử mua hàng
router.get("/me/orders", authMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: {
        orderItems: { include: { product: true } },
        voucher: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ orders });
  } catch (err) {
    console.error("Lỗi lấy lịch sử mua hàng:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});



export default router;

*/





