'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Clock } from 'lucide-react'

interface AdBanner {
	id: string
	imageUrl: string
	linkUrl: string | null
	title: string | null
	endTime: Date
}

export function AdBannerDisplay() {
	const [timeRemaining, setTimeRemaining] = useState<string>('')

	const { data } = useQuery({
		queryKey: ['active-banner'],
		queryFn: async () => {
			const response = await fetch('/api/ad-banners')
			if (!response.ok) throw new Error('Failed to fetch banner')
			return response.json()
		},
		refetchInterval: 30000, // Refetch every 30 seconds
		staleTime: 30000,
	})

	const banner = data?.banner as AdBanner | null

	useEffect(() => {
		if (!banner?.endTime) {
			setTimeRemaining('')
			return
		}

		const updateTimer = () => {
			const now = new Date()
			const end = new Date(banner.endTime)
			const diff = end.getTime() - now.getTime()

			if (diff <= 0) {
				setTimeRemaining('Expired')
				return
			}

			const days = Math.floor(diff / (1000 * 60 * 60 * 24))
			const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
			const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

			if (days > 0) {
				setTimeRemaining(`${days}d ${hours}h`)
			} else if (hours > 0) {
				setTimeRemaining(`${hours}h ${minutes}m`)
			} else {
				setTimeRemaining(`${minutes}m`)
			}
		}

		updateTimer()
		const interval = setInterval(updateTimer, 60000) // Update every minute

		return () => clearInterval(interval)
	}, [banner])

	if (!banner) return null

	const content = (
		<div className="relative w-full h-[200px] overflow-hidden rounded-lg border bg-card">
			<img
				src={banner.imageUrl}
				alt={banner.title || 'Advertisement'}
				className="w-full h-full object-contain bg-background"
			/>
			{timeRemaining && (
				<div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 bg-black/70 text-white text-xs rounded">
					<Clock className="h-3 w-3" />
					<span>{timeRemaining}</span>
				</div>
			)}
		</div>
	)

	if (banner.linkUrl) {
		return (
			<Link href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className="block">
				{content}
			</Link>
		)
	}

	return content
}
