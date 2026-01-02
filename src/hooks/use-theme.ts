import { useState, useEffect } from "react"

type Theme = "light" | "dark"

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme") as Theme
    if (stored) return stored
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  })

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(theme)
    localStorage.setItem("theme", theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"))

  return { theme, setTheme, toggleTheme }
}
