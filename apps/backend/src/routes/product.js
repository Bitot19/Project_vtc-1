import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ===== Create Product =====
router.post("/", async (req, res) => {
  try {
    const { name, description, image, size, price, quantity, categoryId, categoryName } = req.body;

    let categoryConnect;

    if (categoryId) {
      // Nối với category đã tồn tại
      categoryConnect = { connect: { id: categoryId } };
    } else if (categoryName) {
      // Tạo mới category
      categoryConnect = { create: { name: categoryName } };
    } else {
      return res.status(400).json({ error: "Cần cung cấp categoryId hoặc categoryName" });
    }

    const product = await prisma.product.create({
      data: {
        name,
        description,
        image,
        size,
        price,
        quantity,
        category: categoryConnect,
      },
      include: { category: true }, // trả luôn category
    });

    res.status(201).json({ product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Read all Products =====
router.get("/", async (_req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: { category: true },
    });
    res.json({ products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Read single Product =====
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id: parseInt(id) },
      include: { category: true },
    });
    if (!product) return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
    res.json({ product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Update Product =====
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, image, size, price, quantity, categoryId, categoryName } = req.body;

    let categoryConnect;
    if (categoryId) categoryConnect = { connect: { id: categoryId } };
    else if (categoryName) categoryConnect = { create: { name: categoryName } };

    const product = await prisma.product.update({
      where: { id: parseInt(id) },
      data: {
        name,
        description,
        image,
        size,
        price,
        quantity,
        ...(categoryConnect && { category: categoryConnect }),
      },
      include: { category: true },
    });

    res.json({ product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Delete Product =====
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Xóa sản phẩm thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

export default router;
