import jwt from "jsonwebtoken";
const t = jwt.sign(
  {
    userId: "HeCKPAkHEiGrgkG76wfV2",
    userPlatformId: "USER-0005",
    email: "ricardo.agnolo@hotmail.com",
    type: "access",
  },
  process.env.JWT_SECRET || "dev-secret",
  { expiresIn: "15m" },
);
console.log(t);
