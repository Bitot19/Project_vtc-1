// routes/userRoutes.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "16022002";

// ===== Đăng ký user bình thường =====
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email và mật khẩu là bắt buộc" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email đã được sử dụng" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { email, password: hashedPassword, name, role: "USER" },
    });

    res.status(201).json({
      message: "Đăng ký thành công",
      user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Đăng nhập =====
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email và mật khẩu là bắt buộc" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: "Sai email hoặc mật khẩu" });
    }

    // ✅ Kiểm tra tài khoản có đang hoạt động không
    if (!user.isActive) {
      return res.status(403).json({ error: "Tài khoản của bạn đã bị vô hiệu hóa liên hệ admin để được giải quyết" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: "Sai email hoặc mật khẩu" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Lấy profile hiện tại =====
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, createdAt: true, role: true },
    });

    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Tạo user admin (chỉ admin mới làm được) =====
router.post("/admin", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email và mật khẩu là bắt buộc" });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: "Email đã được sử dụng" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { email, password: hashedPassword, name, role: "ADMIN" },
    });

    res.status(201).json({
      message: "Tạo admin thành công",
      user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Lấy danh sách tất cả user (admin) =====
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, createdAt: true, role: true },
    });
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Lấy thông tin 1 user theo id (admin) =====
router.get("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: { id: true, email: true, name: true, createdAt: true, role: true },
    });
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Xóa user (admin) =====
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.user.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Xóa user thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Admin cập nhật role user =====
router.put("/:id/role", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body; // "USER" | "STAFF" | "ADMIN"

    if (!["USER", "STAFF", "ADMIN"].includes(role)) {
      return res.status(400).json({ error: "Role không hợp lệ" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });

    res.json({ message: "Cập nhật role thành công", user: updatedUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== User tự sửa tên, mật khẩu =====
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const { name, password } = req.body;
    let dataToUpdate = {};
    if (name) dataToUpdate.name = name;
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      dataToUpdate.password = hashed;
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: dataToUpdate,
      select: { id: true, email: true, name: true, createdAt: true, role: true },
    });
    res.json({ message: "Cập nhật thành công", user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});
// ===== Admin sửa thông tin user =====
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, password, email, role } = req.body;

    let dataToUpdate = {};
    if (name) dataToUpdate.name = name;
    if (email) dataToUpdate.email = email;
    if (role) dataToUpdate.role = role;
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      dataToUpdate.password = hashed;
    }

    const updated = await prisma.user.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
      select: { 
        id: true, 
        email: true, 
        name: true, 
        role: true, 
        createdAt: true 
      },
    });

    res.json({ message: "Admin cập nhật thành công", user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});
// ===== Khóa / mở khóa tài khoản (admin) =====
router.put("/:id/lock", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body; // true = mở, false = khóa

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isActive },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    res.json({ message: isActive ? "Đã mở khóa tài khoản" : "Đã khóa tài khoản", user: updatedUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});


export default router;




/*
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "16022002";

// ===== Đăng ký user bình thường =====
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email và mật khẩu là bắt buộc" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email đã được sử dụng" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { email, password: hashedPassword, name, isAdmin: false },
    });

    res.status(201).json({
      message: "Đăng ký thành công",
      user: { id: newUser.id, email: newUser.email, name: newUser.name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Đăng nhập =====
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email và mật khẩu là bắt buộc" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: "Sai email hoặc mật khẩu" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Sai email hoặc mật khẩu" });

    const token = jwt.sign(
      { id: user.id, email: user.email, isAdmin: user.isAdmin || false },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ message: "Đăng nhập thành công", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Lấy profile hiện tại =====
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, createdAt: true, isAdmin: true },
    });

    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===== Tạo user admin (chỉ admin mới làm được) =====
import { adminMiddleware } from "../middleware/adminMiddleware.js";

router.post("/admin", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email và mật khẩu là bắt buộc" });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: "Email đã được sử dụng" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: { email, password: hashedPassword, name, isAdmin: true },
    });

    res.status(201).json({ message: "Tạo admin thành công", user: { id: newUser.id, email: newUser.email, name: newUser.name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});
// Lấy danh sách tất cả user (admin)
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, createdAt: true, role: true }
    });
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Lấy thông tin 1 user theo id (admin)
router.get("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: { id: true, email: true, name: true, createdAt: true, isAdmin: true }
    });
    if (!user) return res.status(404).json({ error: "Không tìm thấy user" });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Xóa user (admin)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    // Kiểm tra quyền admin
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ error: "Bạn không có quyền admin để xóa user" });
    }

    const { id } = req.params;

    await prisma.user.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Xóa user thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});


// Admin cập nhật role user (chuyển user thường thành admin)
router.put("/id/role", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isAdmin } = req.body; // true / false
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isAdmin: Boolean(isAdmin) }
    });
    res.json({ message: "Cập nhật role thành công", user: updatedUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});
// User tự sửa tên, mật khẩu
router.put("/me", authMiddleware, async (req, res) => {
  try {
    const { name, password } = req.body;
    let dataToUpdate = {};
    if (name) dataToUpdate.name = name;
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      dataToUpdate.password = hashed;
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: dataToUpdate,
      select: { id: true, email: true, name: true, createdAt: true }
    });
    res.json({ message: "Cập nhật thành công", user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server" });
  }
});



export default router;
*/