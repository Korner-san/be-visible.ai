"use client"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { ChevronRight, Globe } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface DomainData {
    domain: string
    urls_count: number
    mentions_count: number
    prompt_coverage: number
    model_coverage: number
}

interface CitationTableProps {
    data: DomainData[]
}

export function CitationTable({ data }: CitationTableProps) {
    return (
        <div className="rounded-md border bg-card">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50 text-xs hover:bg-muted/50 uppercase tracking-wider">
                        <TableHead className="w-[300px]">Domain</TableHead>
                        <TableHead className="text-right">Unique URLs</TableHead>
                        <TableHead className="text-right">Mentions</TableHead>
                        <TableHead className="w-[200px]">Prompt Coverage</TableHead>
                        <TableHead className="w-[200px]">Model Coverage</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row) => (
                        <TableRow key={row.domain} className="group">
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8 rounded-sm bg-muted p-1">
                                        <AvatarImage src={`https://www.google.com/s2/favicons?domain=${row.domain}&sz=128`} />
                                        <AvatarFallback><Globe className="h-4 w-4" /></AvatarFallback>
                                    </Avatar>
                                    <span className="font-semibold">{row.domain}</span>
                                </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">
                                {row.urls_count.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-bold">
                                {row.mentions_count.toLocaleString()}
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <Progress value={row.prompt_coverage} className="h-2 bg-muted [&>div]:bg-primary" />
                                    <span className="w-9 text-xs font-medium text-muted-foreground">{row.prompt_coverage}%</span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <Progress value={row.model_coverage} className="h-2 bg-muted [&>div]:bg-emerald-500" />
                                    <span className="w-9 text-xs font-medium text-muted-foreground">{row.model_coverage}%</span>
                                </div>
                            </TableCell>
                            <TableCell className="text-right">
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
