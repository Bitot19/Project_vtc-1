
export function adminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Chưa xác thực" });
  }

  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Bạn không có quyền truy cập (Tư cách Admin)" });
  }

  next();
}




// adminMiddleware.js
/*export function adminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Chưa xác thực" });
  }

  // Giả sử token chứa field isAdmin
  if (!req.user.role) {
    return res.status(403).json({ error: "Không có quyền truy cập" });
  }

  next();
}
  */
