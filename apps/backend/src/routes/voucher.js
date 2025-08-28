import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { staffMiddleware } from "../middleware/staffMiddleware.js";
import { adminMiddleware } from "../middleware/adminMiddleware.js";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET tất cả voucher (ai cũng xem được)
 */
router.get("/", async (req, res) => {
  try {
    const vouchers = await prisma.voucher.findMany();
    res.json(vouchers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET 1 voucher theo code
 */
router.get("/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const voucher = await prisma.voucher.findUnique({
      where: { code },
    });
    if (!voucher) {
      return res.status(404).json({ error: "Voucher không tồn tại" });
    }
    res.json(voucher);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST tạo voucher mới (STAFF hoặc ADMIN mới có quyền)
 */
router.post("/", authMiddleware, staffMiddleware, async (req, res) => {
  try {
    const { code, discount, quantity, isActive } = req.body;

    const newVoucher = await prisma.voucher.create({
      data: {
        code,
        discount,
        quantity,
        isActive: isActive ?? true,
      },
    });

    res.json(newVoucher);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT cập nhật voucher (STAFF hoặc ADMIN)
 */
router.put("/:id", authMiddleware, staffMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { discount, quantity, isActive } = req.body;

    const updatedVoucher = await prisma.voucher.update({
      where: { id: parseInt(id) },
      data: {
        discount,
        quantity,
        isActive,
      },
    });

    res.json(updatedVoucher);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT cập nhật tất cả các trường voucher (chỉ ADMIN)
 */
router.put("/admin/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, discount, quantity, isActive } = req.body;

    // Kiểm tra xem voucher có tồn tại không
    const existingVoucher = await prisma.voucher.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingVoucher) {
      return res.status(404).json({ error: "Voucher không tồn tại" });
    }

    // Cập nhật voucher
    const updatedVoucher = await prisma.voucher.update({
      where: { id: parseInt(id) },
      data: {
        code,        // cập nhật code
        discount,
        quantity,
        isActive,
      },
    });

    res.json(updatedVoucher);
  } catch (err) {
    // Nếu code bị trùng, Prisma sẽ ném lỗi
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Code voucher đã tồn tại" });
    }
    res.status(500).json({ error: err.message });
  }
});


/**
 * DELETE voucher (chỉ ADMIN)
 */
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.voucher.delete({
      where: { id: parseInt(id) },
    });

    res.json({ message: "Xóa voucher thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
