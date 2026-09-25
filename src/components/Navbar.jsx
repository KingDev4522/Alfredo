import { useRef } from "react";
import { NavLink } from "react-router-dom";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/interpret", label: "Interpret", accent: "#2DE2E6" },
  { to: "/record", label: "Record Signs", accent: "#FF4D6D" },
  { to: "/delete", label: "Delete Recordings", accent: "#FFB627" },
];

export function Navbar() {
  const navRef = useRef(null);

  useGSAP(
    () => {
      gsap.from(navRef.current, {
        autoAlpha: 0,
        y: -16,
        duration: 0.5,
        ease: "power2.out",
      });
    },
    { scope: navRef }
  );

  return (
    <nav
      ref={navRef}
      className="sticky top-0 z-50 w-full flex items-center justify-between gap-4 px-5 sm:px-8 py-4 flex-wrap"
      style={{
        backgroundColor: "rgba(5, 5, 5, 0.75)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <NavLink
        to="/"
        className="flex items-center gap-2 text-sm font-bold tracking-wide"
        style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F2F4F8" }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: "#2DE2E6", boxShadow: "0 0 8px #2DE2E6" }}
        />
        ISL Interpreter
      </NavLink>

      <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `nav-link relative px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors duration-200 ${
                isActive ? "text-white" : ""
              }`
            }
            style={({ isActive }) => ({
              color: isActive ? "#F2F4F8" : "#8A93A8",
              fontFamily: "'JetBrains Mono', monospace",
            })}
          >
            {({ isActive }) => (
              <span className="relative inline-flex flex-col items-center">
                {link.label}
                <span
                  className="absolute -bottom-1.5 h-[2px] rounded-full transition-all duration-300"
                  style={{
                    width: isActive ? "100%" : "0%",
                    backgroundColor: link.accent || "#2DE2E6",
                    boxShadow: isActive ? `0 0 6px ${link.accent || "#2DE2E6"}` : "none",
                  }}
                />
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
