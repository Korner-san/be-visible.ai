"use client"

import { Bell } from "lucide-react"
import { usePathname } from "next/navigation"

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/ThemeToggle"

export function Header() {
    const pathname = usePathname()

    // Simple breadcrumb logic based on pathname
    const segments = pathname.split('/').filter(Boolean)

    return (
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 border-b px-4">
            <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/" className="hidden md:block">
                                Analytics
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        {segments.length > 0 && <BreadcrumbSeparator className="hidden md:block" />}
                        <BreadcrumbItem>
                            <BreadcrumbPage>Website Citations</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </div>
            <div className="ml-auto flex items-center gap-2">
                <div className="relative w-64 hidden md:block">
                    <Input
                        type="search"
                        placeholder="Search..."
                        className="h-9 w-full rounded-md bg-muted/50 px-4 py-2 text-sm"
                    />
                </div>
                <ThemeToggle />
                <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Bell className="h-4 w-4" />
                    <span className="sr-only">Notifications</span>
                </Button>
            </div>
        </header>
    )
}
