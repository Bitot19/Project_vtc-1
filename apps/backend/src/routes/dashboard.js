import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /dashboard/summary
 * Tổng quan: tổng user, sản phẩm, đơn hàng, doanh thu
 */
router.get("/summary", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [userCount, productCount, orderCount, totalRevenue] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.order.aggregate({
        _sum: { totalPrice: true },
        where: { status: "COMPLETED" },
      }),
    ]);

    res.json({
      users: userCount,
      products: productCount,
      orders: orderCount,
      revenue: totalRevenue._sum.totalPrice || 0,
    });
  } catch (error) {
    res.status(500).json({ error: "Lỗi server khi lấy dashboard summary" });
  }
});

/**
 * GET /dashboard/orders-by-status
 * Đếm đơn hàng theo trạng thái
 */
router.get("/orders-by-status", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.groupBy({
      by: ["status"],
      _count: { status: true },
    });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Lỗi server khi thống kê đơn hàng" });
  }
});

/**
 * GET /dashboard/revenue-by-date?from=2025-08-01&to=2025-08-28
 * Doanh thu theo ngày
 */
router.get("/revenue-by-date", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;

    const orders = await prisma.order.findMany({
      where: {
        status: "COMPLETED",
        createdAt: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      select: {
        createdAt: true,
        totalPrice: true,
      },
    });

    // Gom nhóm theo ngày
    const revenueByDate = {};
    orders.forEach((order) => {
      const date = order.createdAt.toISOString().split("T")[0];
      revenueByDate[date] = (revenueByDate[date] || 0) + order.totalPrice;
    });

    res.json(revenueByDate);
  } catch (error) {
    res.status(500).json({ error: "Lỗi server khi lấy doanh thu theo ngày" });
  }
});

/**
 * GET /dashboard/top-products?limit=5
 * Top sản phẩm bán chạy
 */
router.get("/top-products", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const topProducts = await prisma.orderItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    });

    // Lấy thêm thông tin sản phẩm
    const products = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
        });
        return { ...product, sold: item._sum.quantity };
      })
    );

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Lỗi server khi lấy top sản phẩm" });
  }
});

export default router;
