import Link from "next/link";
import Image from "next/image";
import { Poppins } from "next/font/google";
import img1 from "../../../../public/image/img1.png";

import { cn } from "@/lib/utils";

const font = Poppins({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

export const Logo = () => {
  return (
    <Link href="/">
      <div className="flex items-center gap-x-4 hover:opacity-75 transition">
        <div className="bg-white rounded-full p-1 mr-12 shrink-0 lg:mr-0 lg:shrink">
          <Image src={img1} alt="Switched.fun" height="50" width="50" />
        </div>
        <div className={cn("hidden lg:block", font.className)}>
          <p className="text-lg font-semibold">Switched.fun</p>
          <p className="text-xs text-muted-foreground">
            Be rewarded for streams
          </p>
        </div>
      </div>
    </Link>
  );
};
