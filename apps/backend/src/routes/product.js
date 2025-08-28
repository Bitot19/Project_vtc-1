import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { staffMiddleware } from "../middleware/staffMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = Router();
const prisma = new PrismaClient();

/* ===== Hàm bỏ dấu tiếng Việt ===== */
const removeVietnameseTones = (str) => {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

/* ===== Tạo sản phẩm ===== */
router.post("/", authMiddleware, staffMiddleware, async (req, res) => {
  try {
    const { name, description, image, size, price, quantity, categoryId, categoryName } = req.body;

    let categoryConnect;
    if (categoryId) {
      categoryConnect = { connect: { id: parseInt(categoryId) } };
    } else if (categoryName) {
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
      include: { category: true },
    });

    res.status(201).json({ product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

/* ===== Lấy danh sách sản phẩm ===== */
router.get("/", async (req, res) => {
  try {
    const { name, categoryId } = req.query;

    const filters = {};
    if (categoryId) filters.categoryId = Number(categoryId);

    let products = await prisma.product.findMany({
      where: filters,
      include: { category: true },
    });
    //
    // Lọc theo tên (bỏ dấu + lowercase) nếu có
    if (name) {
      const keyword = removeVietnameseTones(name.toLowerCase());
      products = products.filter((p) =>
        removeVietnameseTones(p.name.toLowerCase()).includes(keyword)
      );
    }

    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Lỗi server" });
  }
});

/* ===== Tìm kiếm sản phẩm theo tên (có dấu/không dấu) + lọc danh mục ===== */
router.get("/search", async (req, res) => {
  try {
    const { q, categoryId } = req.query;
    const filters = {};
    if (categoryId) filters.categoryId = parseInt(categoryId);

    let products = await prisma.product.findMany({
      where: filters,
      include: { category: true },
    });

    if (q) {
      const qNoAccent = removeVietnameseTones(q.toLowerCase());
      products = products.filter((p) =>
        removeVietnameseTones(p.name.toLowerCase()).includes(qNoAccent)
      );
    }

    res.json({ products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

/* ===== Đọc sản phẩm duy nhất ===== */
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });

    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!product) return res.status(404).json({ error: "Không tìm thấy sản phẩm" });

    res.json({ product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

/* ===== Cập nhật sản phẩm ===== */
router.put("/:id", authMiddleware, staffMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });

    const { name, description, image, size, price, quantity, categoryId, categoryName } = req.body;

    let categoryConnect;
    if (categoryId) categoryConnect = { connect: { id: parseInt(categoryId) } };
    else if (categoryName) categoryConnect = { create: { name: categoryName } };

    const product = await prisma.product.update({
      where: { id },
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

/* ===== Xóa sản phẩm ===== */
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID không hợp lệ" });

    await prisma.product.delete({ where: { id } });
    res.json({ message: "Xóa sản phẩm thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

export default router;


/*
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { staffMiddleware } from "../middleware/staffMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = Router();
const prisma = new PrismaClient();

// ===== Tạo sản phẩm =====
router.post("/", authMiddleware, staffMiddleware, async (req, res) => {
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

// ===== Đọc tất cả sản phẩm =====
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

// ===== Đọc sản phẩm duy nhất =====
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

// ===== Cập nhật sản phẩm =====
router.put("/:id", authMiddleware, staffMiddleware, async (req, res) => {
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

// =====Xóa sản phẩm =====
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
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

*/





/*
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
*/