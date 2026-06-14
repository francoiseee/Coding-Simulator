import Navbar from "@/components/Navbar";
import SignUpContainer from "@/components/SignUpContainer";
import HeroPane from "@/components/HeroPane";
import SignUpForm from "@/components/SignUpForm";

export default function Home() {
  return (
    <>
      <Navbar />
      <SignUpContainer>
        <HeroPane />
        <SignUpForm />
      </SignUpContainer>
    </>
  );
}
