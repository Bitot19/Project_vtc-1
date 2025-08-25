// src/routes/auth.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../prisma.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

// Register
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) 
      return res.status(400).json({ message: "Email và password là bắt buộc" });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) 
      return res.status(400).json({ message: "Email đã tồn tại" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, name },
      select: { id: true, email: true, name: true, createdAt: true }
    });

    return res.status(201).json({ message: "Đăng ký thành công", user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) 
      return res.status(400).json({ message: "Email và password là bắt buộc" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ message: "Email hoặc mật khẩu không đúng" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: "Email hoặc mật khẩu không đúng" });

    const payload = { id: user.id, email: user.email };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    const safeUser = { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
    return res.json({ message: "Đăng nhập thành công", token, user: safeUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi server" });
  }
});


export default router;
