'use client'

import { Button } from './ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
	currentPage: number
	totalPages: number
	onPageChange: (page: number) => void
	showing?: { from: number; to: number; total: number }
}

export function Pagination({ currentPage, totalPages, onPageChange, showing }: PaginationProps) {
	const getPageNumbers = () => {
		const pages: (number | string)[] = []
		const maxVisible = 5

		if (totalPages <= maxVisible) {
			// Show all pages if total is small
			for (let i = 1; i <= totalPages; i++) {
				pages.push(i)
			}
		} else {
			// Always show first page
			pages.push(1)

			// Calculate start and end
			let start = Math.max(2, currentPage - 1)
			let end = Math.min(totalPages - 1, currentPage + 1)

			// Adjust if we're at the start or end
			if (currentPage <= 3) {
				start = 2
				end = 4
			} else if (currentPage >= totalPages - 2) {
				start = totalPages - 3
				end = totalPages - 1
			}

			// Add ellipsis if needed
			if (start > 2) {
				pages.push('...')
			}

			// Add page numbers in range
			for (let i = start; i <= end; i++) {
				pages.push(i)
			}

			// Add ellipsis if needed
			if (end < totalPages - 1) {
				pages.push('...')
			}

			// Always show last page
			pages.push(totalPages)
		}

		return pages
	}

	if (totalPages <= 1) {
		return null
	}

	return (
		<div className="flex items-center justify-between px-2 py-4">
			{showing && (
				<div className="text-sm text-muted-foreground">
					Showing {showing.from}-{showing.to} of {showing.total}
				</div>
			)}
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(currentPage - 1)}
					disabled={currentPage === 1}
				>
					<ChevronLeft className="h-4 w-4" />
					Previous
				</Button>

				<div className="flex items-center gap-1">
					{getPageNumbers().map((page, idx) => {
						if (page === '...') {
							return (
								<span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
									...
								</span>
							)
						}

						return (
							<Button
								key={page}
								variant={currentPage === page ? 'default' : 'outline'}
								size="sm"
								onClick={() => typeof page === 'number' && onPageChange(page)}
								className="min-w-[40px]"
							>
								{page}
							</Button>
						)
					})}
				</div>

				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(currentPage + 1)}
					disabled={currentPage === totalPages}
				>
					Next
					<ChevronRight className="h-4 w-4" />
				</Button>
			</div>
		</div>
	)
}


