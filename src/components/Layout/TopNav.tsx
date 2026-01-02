import { Link, useLocation } from "react-router-dom"
import { Menu, Upload, FolderOpen, RefreshCw, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ServerSelector } from "@/components/servers/ServerSelector"
import { ThemeToggle } from "@/components/Layout/ThemeToggle"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/browse", label: "Browse", icon: FolderOpen },
  { to: "/sync", label: "Sync", icon: RefreshCw },
]

export function TopNav() {
  const location = useLocation()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        {/* Logo */}
        <Link to="/" className="mr-6 flex items-center space-x-2">
          <span className="text-xl">🌸</span>
          <span className="font-bold">Bouquet</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "transition-colors hover:text-foreground/80",
                location.pathname === item.to
                  ? "text-foreground"
                  : "text-foreground/60"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right Side */}
        <div className="flex flex-1 items-center justify-end space-x-2">
          <div className="hidden md:flex items-center space-x-2">
            <ServerSelector />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuItem>Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px]">
              <MobileNav />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

function MobileNav() {
  const location = useLocation()

  return (
    <div className="flex flex-col space-y-4 mt-4">
      <nav className="flex flex-col space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex items-center space-x-2 px-2 py-2 rounded-md transition-colors",
              location.pathname === item.to
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="border-t pt-4">
        <p className="text-sm text-muted-foreground mb-2">Server</p>
        <ServerSelector />
      </div>
      <div className="border-t pt-4 flex items-center justify-between">
        <span className="text-sm">Theme</span>
        <ThemeToggle />
      </div>
    </div>
  )
}
