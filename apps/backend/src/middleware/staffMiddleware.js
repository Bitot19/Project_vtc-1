export function staffMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Chưa xác thực" });
  }

  if (req.user.role !== "STAFF" && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Bạn không có quyền truy cập ( Tư cách STAFF )" });
  }

  next();
}
