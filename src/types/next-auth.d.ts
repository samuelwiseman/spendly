import "@auth/core/types";
import "@auth/core/jwt";

declare module "@auth/core/types" {
  interface Session {
    userId: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId?: number;
  }
}
