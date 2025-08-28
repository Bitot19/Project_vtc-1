import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { staffMiddleware } from "../middleware/staffMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /bestsellers
 * Lấy tất cả sản phẩm bán chạy
 */
router.get("/", async (req, res) => {
  try {
    const bestsellers = await prisma.bestSeller.findMany({
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(bestsellers);
  } catch (error) {
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
