import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();
const prisma = new PrismaClient();

// Lấy danh sách sản phẩm
router.get("/", async (req, res) => {
  const products = await prisma.product.findMany();
  res.json({ products });
});

// Thêm sản phẩm mới
router.post("/", authMiddleware, async (req, res) => {
  const { category, name, description, image, size, price, quantity } = req.body;
  const product = await prisma.product.create({
    data: {
      category,
      name,
      description,
      image,
      size,
      price: Number(price),
      quantity: Number(quantity)
    }
  });
  res.status(201).json({ message: "Thêm sản phẩm thành công", product });
});

// Sửa sản phẩm
router.put("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { category, name, description, image, size, price, quantity } = req.body;
  try {
    const product = await prisma.product.update({
      where: { id: Number(id) },
      data: {
        category,
        name,
        description,
        image,
        size,
        price: Number(price),
        quantity: Number(quantity)
      }
    });
    res.json({ message: "Cập nhật sản phẩm thành công", product });
  } catch (err) {
    res.status(404).json({ error: "Không tìm thấy sản phẩm" });
  }
});

// Xóa sản phẩm
router.delete("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.product.delete({ where: { id: Number(id) } });
    res.json({ message: "Xóa sản phẩm thành công" });
  } catch (err) {
    res.status(404).json({ error: "Không tìm thấy sản phẩm" });
  }
});

export default router;
