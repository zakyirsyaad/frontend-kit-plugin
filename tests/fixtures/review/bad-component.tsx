import { motion } from "motion/react";
import { Geist } from "next/font/google";
import { Activity } from "lucide-react";
import { IconBolt } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Canvas } from "@react-three/fiber";
import { Card, CardContent } from "@/components/ui/card";

const geist = Geist({ subsets: ["latin"] });

export function BadComponent({ state }: { state: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.to(ref.current, { opacity: 1 });
  }, []);

  return (
    <div ref={ref} className="rounded-sm rounded-2xl rounded-full shadow-black bg-zinc-800 p-4">
      <span className={`bg-status-${state} size-2 rounded-full`} />
      {/* three colored dots and no words anywhere near them */}
      <span className="size-2 rounded-full bg-status-live" />
      <span className="size-2 rounded-full bg-status-warning" />
      <span className="size-2 rounded-full bg-status-error" />
      <h2 className="bg-clip-text text-transparent bg-gradient-to-r from-violet-500 to-indigo-500">Title</h2>
      <button className="bg-purple-600 w-4 h-4">🚀</button>
      <Activity />
      <IconBolt />
      <Canvas />
      <Card>
        <CardContent>
          <Card>Nested</Card>
        </CardContent>
      </Card>
      <div dangerouslySetInnerHTML={{ __html: "<b>raw</b>" }} />
      <motion.div animate={{ x: 10 }} className={geist.className} />
    </div>
  );
}
