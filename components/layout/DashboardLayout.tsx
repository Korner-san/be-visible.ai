"use client"

import { AppSidebar } from "./AppSidebar"
import { Header } from "./Header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <Header />
                <div className="flex flex-1 flex-col gap-4 p-4 pt-0 bg-background/50">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}
