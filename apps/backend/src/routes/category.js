import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// Lấy tất cả danh mục
router.get("/", async (req, res) => {
  const categories = await prisma.category.findMany();
  res.json(categories);
});

// Tạo danh mục mới
router.post("/", async (req, res) => {
  const { name } = req.body;
  try {
    const category = await prisma.category.create({ data: { name } });
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ error: "Danh mục đã tồn tại hoặc lỗi server" });
  }
});

// Sửa danh mục
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    const category = await prisma.category.update({
      where: { id: Number(id) },
      data: { name },
    });
    res.json(category);
  } catch (err) {
    res.status(400).json({ error: "Không thể cập nhật danh mục" });
  }
});

// Xóa danh mục
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.category.delete({ where: { id: Number(id) } });
    res.json({ message: "Xóa thành công" });
  } catch (err) {
    res.status(400).json({ error: "Không thể xóa danh mục" });
  }
});

export default router;
