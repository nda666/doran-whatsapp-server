import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import Router from "next/router";
import { useRouter } from "next/navigation";

const Signout = () => {
  const router = useRouter();
  useEffect(() => {
    signOut({
      callbackUrl: "/",
      redirect: true,
    });
  }, []);
  return <p>Signout...</p>;
};

export default Signout;
