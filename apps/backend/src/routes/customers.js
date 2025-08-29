// routes/customers.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = Router();
const prisma = new PrismaClient();

router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;   // trang hiện tại
    const limit = parseInt(req.query.limit) || 10; // số khách hàng/trang
    const skip = (page - 1) * limit;

    const totalCustomers = await prisma.user.count({ where: { role: "USER" } });

    const customers = await prisma.user.findMany({
      where: { role: "USER" },
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        isActive: true,
        orders: {
          select: {
            id: true,
            totalPrice: true,
            status: true,
            createdAt: true,
            orderItems: {
              select: {
                id: true,
                quantity: true,
                price: true,
                product: { select: { id: true, name: true, price: true } },
              },
            },
            voucher: { select: { code: true, discount: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // map tổng tiền, số đơn, lastOrderDate như trước
    const result = customers.map(customer => {
      const totalSpent = customer.orders.reduce((sum, order) => sum + order.totalPrice, 0);
      const totalOrders = customer.orders.length;
      const lastOrderDate = totalOrders > 0 ? customer.orders[0].createdAt : null;

      const orders = customer.orders.map(order => ({
        id: order.id,
        status: order.status,
        totalPrice: order.totalPrice,
        createdAt: order.createdAt,
        orderItems: order.orderItems.map(item => ({
          id: item.id,
          product: item.product,
          quantity: item.quantity,
          subtotal: item.price * item.quantity
        })),
        voucher: order.voucher ? { code: order.voucher.code, discount: order.voucher.discount } : null,
      }));

      return {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        createdAt: customer.createdAt,
        isActive: customer.isActive,
        totalSpent,
        totalOrders,
        lastOrderDate,
        orders
      };
    });

    res.json({
      totalCustomers,
      page,
      limit,
      totalPages: Math.ceil(totalCustomers / limit),
      customers: result
    });
  } catch (err) {
    console.error("Lỗi lấy danh sách khách hàng:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});


export default router;
