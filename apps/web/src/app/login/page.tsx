"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoomicLogoInverted } from "../../components/icons/loomic-logo";
import { LoginForm } from "../../components/login-form";
import { LoadingScreen } from "../../components/loading-screen";
import { useAuth } from "../../lib/auth-context";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const features = [
  "Design and iterate with intelligent agents",
  "Organize projects in a unified workspace",
  "From concept to production, end to end",
];

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [user, loading, router]);

  if (loading || user) return <LoadingScreen />;

  return (
    <div className="flex min-h-screen">
      {/* Left panel -- dark brand */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-black text-white flex-col justify-center px-16">
        {/* Subtle radial glow */}
        <div className="pointer-events-none absolute -left-1/4 -top-1/4 h-[80%] w-[80%] rounded-full bg-white/[0.03] blur-[100px]" />

        <motion.div
          initial="hidden"
          animate="visible"
          className="relative z-10"
        >
          <motion.div
            variants={fadeUp}
            custom={0}
            className="flex items-center gap-4 mb-4"
          >
            <LoomicLogoInverted className="size-14" />
            <h1 className="text-4xl font-bold tracking-tight">Loomic</h1>
          </motion.div>

          <motion.p
            variants={fadeUp}
            custom={1}
            className="text-lg text-neutral-400 mb-10"
          >
            AI-powered creative workspace
          </motion.p>

          <ul className="space-y-4 text-sm text-neutral-300">
            {features.map((text, i) => (
              <motion.li
                key={text}
                variants={fadeUp}
                custom={i + 2}
                className="flex items-start gap-3"
              >
                <span className="mt-1.5 block h-1.5 w-1.5 rounded-full bg-white shrink-0" />
                {text}
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* Right panel -- login form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <LoginForm />
        </motion.div>
      </div>
    </div>
  );
}
