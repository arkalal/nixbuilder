"use client";

import { useState } from "react";
import Header from "../Header/Header";
import Hero from "../Hero/Hero";
import HowItWorks from "../HowItWorks/HowItWorks";
import Features from "../Features/Features";
import FAQ from "../FAQ/FAQ";
import Footer from "../Footer/Footer";
import AuthModal from "../AuthModal/AuthModal";
import DemoModal from "../DemoModal/DemoModal";

export default function Landing() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  return (
    <>
      <Header onAuthClick={() => setIsAuthOpen(true)} />
      <Hero 
        onAuthClick={() => setIsAuthOpen(true)}
        onDemoClick={() => setIsDemoOpen(true)}
      />
      <HowItWorks />
      <Features />
      <FAQ />
      <Footer />
      
      <AuthModal 
        isOpen={isAuthOpen} 
        onClose={() => setIsAuthOpen(false)} 
      />
      <DemoModal 
        isOpen={isDemoOpen} 
        onClose={() => setIsDemoOpen(false)} 
      />
    </>
  );
}
