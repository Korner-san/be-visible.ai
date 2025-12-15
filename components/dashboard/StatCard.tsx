import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatCardProps {
    title: string
    value: string | number
    change?: string
    trend?: "up" | "down" | "neutral"
    subtext?: string
    icon?: React.ReactNode
}

export function StatCard({ title, value, change, trend, subtext, icon }: StatCardProps) {
    return (
        <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                {icon && <div className="text-muted-foreground">{icon}</div>}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {(change || subtext) && (
                    <div className="flex items-center text-xs text-muted-foreground mt-1">
                        {change && (
                            <span
                                className={cn(
                                    "flex items-center font-medium mr-2",
                                    trend === "up" && "text-green-500",
                                    trend === "down" && "text-red-500",
                                    trend === "neutral" && "text-yellow-500"
                                )}
                            >
                                {trend === "up" && <ArrowUpRight className="mr-1 h-3 w-3" />}
                                {trend === "down" && <ArrowDownRight className="mr-1 h-3 w-3" />}
                                {trend === "neutral" && <Minus className="mr-1 h-3 w-3" />}
                                {change}
                            </span>
                        )}
                        {subtext && <span>{subtext}</span>}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
