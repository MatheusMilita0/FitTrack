const allowedRoutes = {
  student: new Set([
    "student-dashboard",
    "workout",
    "library",
    "nutrition",
    "chat",
    "history",
    "profile",
  ]),
  personal: new Set([
    "personal-dashboard",
    "students",
    "create-workout",
    "assign-workout",
    "feedback",
    "personal-chat",
    "profile",
  ]),
  admin: new Set(["admin-dashboard", "profile"]),
};

const homeRoutes = {
  student: "student-dashboard",
  personal: "personal-dashboard",
  admin: "admin-dashboard",
};

export function resolveRoute(user, profile, requestedRoute) {
  if (!user)
    return ["login", "signup", "forgot"].includes(requestedRoute)
      ? requestedRoute
      : "login";
  if (
    user.tipo === "personal" &&
    (user.status !== "Ativo" || profile?.status_cref !== "Validado")
  ) {
    return "personal-pending";
  }
  return allowedRoutes[user.tipo]?.has(requestedRoute)
    ? requestedRoute
    : homeRoutes[user.tipo] || "login";
}
