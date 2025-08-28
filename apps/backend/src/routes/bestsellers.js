import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { staffMiddleware } from "../middleware/staffMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = Router();
const prisma = new PrismaClient();


// GET /api/bestsellers?page=1&limit=10
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;   // mặc định page = 1
    const limit = parseInt(req.query.limit) || 10; // mặc định 10 item / trang
    const skip = (page - 1) * limit;

    // Đếm tổng số bản ghi
    const total = await prisma.bestSeller.count();

    // Lấy data theo phân trang
    const bestsellers = await prisma.bestSeller.findMany({
      include: { product: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    res.json({
      data: bestsellers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Lỗi server" });
  }
});


/**
 * POST /bestsellers
 * Thêm sản phẩm bán chạy
 * body: { productId }
 */
router.post("/", authMiddleware, staffMiddleware, async (req, res) => {
  try {
    const { productId } = req.body;

    const bestSeller = await prisma.bestSeller.create({
      data: { productId: Number(productId) },
      include: { product: true },
    });

    res.json(bestSeller);
  } catch (error) {
    res.status(500).json({ error: "Không thể thêm sản phẩm bán chạy" });
  }
});

/**
 * PUT /bestsellers/:id
 * Sửa (chỉ thay đổi sang product khác)
 * body: { productId }
 */
router.put("/:id", authMiddleware, staffMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.body;

    const bestSeller = await prisma.bestSeller.update({
      where: { id: Number(id) },
      data: { productId: Number(productId) },
      include: { product: true },
    });

    res.json(bestSeller);
  } catch (error) {
    res.status(500).json({ error: "Không thể cập nhật sản phẩm bán chạy" });
  }
});

/**
 * DELETE /bestsellers/:id
 * Xóa sản phẩm bán chạy
 */
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.bestSeller.delete({
      where: { id: Number(id) },
    });

    res.json({ message: "Xóa thành công" });
  } catch (error) {
    res.status(500).json({ error: "Không thể xóa sản phẩm bán chạy" });
  }
});

export default router;
