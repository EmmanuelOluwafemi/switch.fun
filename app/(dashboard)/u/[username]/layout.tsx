import { redirect } from "next/navigation";

// import { getSelfByUsername } from "@/lib/auth-service";

import { Navbar } from "./_components/navbar";
import { Sidebar } from "./_components/sidebar";
import { Container } from "./_components/container";

interface CreatorLayoutProps {
  params: { username: string };
  children: React.ReactNode;
}

const CreatorLayout = async ({ params, children }: CreatorLayoutProps) => {
  // try {
  //   // const self = await getSelfByUsername(params.username);

  //   // if (!self) {
  //   //   redirect("/");
  //   // }

    
  // } catch (error) {
  //   console.error("Layout Error:", error);
  //   redirect("/");
  // }

  return (
    <>
      <Navbar />
      <div className="flex h-full pt-20">
        <Sidebar />
        <Container>{children}</Container>
      </div>
    </>
  );
};

export default CreatorLayout;
