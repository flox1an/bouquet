import { Outlet } from "react-router-dom"
import { TopNav } from "@/components/Layout/TopNav"
import { Toaster } from "@/components/ui/toaster"
import AudioPlayer from "../AudioPlayer"
import { useGlobalContext } from "../../GlobalState"
import { useCurrentUser } from "../../hooks/useCurrentUser"
import Login from "./Login"
import { useEffect } from "react"
import useLocalStorageState from "../../utils/useLocalStorageState"

export const Layout = () => {
  const { user, loginWithExtension } = useCurrentUser()
  const { state } = useGlobalContext()
  const [autoLogin, setAutoLogin] = useLocalStorageState("autologin", {
    defaultValue: false,
  })

  useEffect(() => {
    if (!user && autoLogin) {
      loginWithExtension().catch(() => {
        setAutoLogin(false)
      })
    }
  }, [])

  const hasAudioPlayer = !!state.currentSong

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className={`flex-1 container py-6 ${hasAudioPlayer ? 'pb-24' : ''}`}>
        {user ? <Outlet /> : <Login />}
      </main>
      {hasAudioPlayer && (
        <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t shadow-lg z-50">
          <AudioPlayer />
        </div>
      )}
      <Toaster />
    </div>
  )
}
