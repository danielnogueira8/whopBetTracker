'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useIframeSdk } from '@whop/react'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Clock, Upload, ExternalLink, DollarSign } from 'lucide-react'

interface PurchaseAdBannerDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

const PRICING = {
	'1_minute': { price: 0, label: '1 Minute (Free Test)', duration: '1 minute' },
	'1_day': { price: 20, label: '1 Day', duration: '1 day' },
	'1_week': { price: 100, label: '1 Week', duration: '7 days' },
	'1_month': { price: 300, label: '1 Month', duration: '30 days' },
}

export function PurchaseAdBannerDialog({ open, onOpenChange }: PurchaseAdBannerDialogProps) {
	const [step, setStep] = useState<'availability' | 'duration' | 'upload' | 'details' | 'review'>('availability')
	const [selectedDuration, setSelectedDuration] = useState<keyof typeof PRICING | null>(null)
	const [imageUrl, setImageUrl] = useState('')
	const [linkUrl, setLinkUrl] = useState('')
	const [title, setTitle] = useState('')
	const [imageFile, setImageFile] = useState<File | null>(null)
	const [preview, setPreview] = useState<string>('')

	// Check availability
	const { data: availability } = useQuery({
		queryKey: ['ad-availability'],
		queryFn: async () => {
			const response = await fetch('/api/ad-banners/availability')
			if (!response.ok) throw new Error('Failed to check availability')
			return response.json()
		},
	})

	const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		// Validate file size (2MB max)
		if (file.size > 2 * 1024 * 1024) {
			alert('Image size must be less than 2MB')
			return
		}

		// Validate file type
		if (!file.type.startsWith('image/')) {
			alert('Please upload an image file')
			return
		}

		setImageFile(file)

		// Create preview
		const reader = new FileReader()
		reader.onload = (e) => {
			const result = e.target?.result as string
			setPreview(result)
			// For now, we'll use base64. In production, upload to a storage service
			setImageUrl(result)
		}
		reader.readAsDataURL(file)
	}

	const iframeSdk = useIframeSdk()

	const checkoutMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch('/api/ad-banners/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ duration: selectedDuration }),
			})
			if (!response.ok) throw new Error('Failed to create checkout')
			return response.json()
		},
		onSuccess: async (data) => {
			// Store banner data temporarily for after payment
			const bannerData = {
				imageUrl,
				linkUrl,
				title,
				duration: selectedDuration,
				purchaseReceiptId: data.checkoutId,
			}

			// Open Whop checkout using iframe SDK
			try {
				if (iframeSdk) {
					// Open checkout
					await iframeSdk.inAppPurchase({
						planId: data.planId,
						id: data.checkoutId,
					})

					// Poll for payment confirmation
					const checkPayment = async (retries = 20) => {
						if (retries === 0) {
							console.error('Payment verification timeout')
							return
						}

						const verificationResponse = await fetch('/api/ad-banners/verify-payment', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ checkoutId: data.checkoutId }),
						})

						if (verificationResponse.ok) {
							const { paid } = await verificationResponse.json()
							if (paid) {
								// Payment confirmed, create banner
								const confirmResponse = await fetch('/api/ad-banners/confirm', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify(bannerData),
								})

								if (confirmResponse.ok) {
									onOpenChange(false)
									window.location.reload()
								}
							} else {
								// Not paid yet, check again in 1 second
								setTimeout(() => checkPayment(retries - 1), 1000)
							}
						}
					}

					// Start checking after 3 seconds
					setTimeout(() => checkPayment(), 3000)
				}
			} catch (error) {
				console.error('Failed to open checkout:', error)
				// Fallback to opening in new tab
				window.open(`https://whop.com/checkout/${data.checkoutId}`, '_blank')
			}
		},
	})

	const handleNext = () => {
		switch (step) {
			case 'availability':
				if (availability?.available) {
					setStep('duration')
				}
				break
			case 'duration':
				if (selectedDuration) {
					setStep('upload')
				}
				break
			case 'upload':
				if (imageUrl) {
					setStep('details')
				}
				break
			case 'details':
				setStep('review')
				break
			case 'review':
				checkoutMutation.mutate()
				break
		}
	}

	const handleBack = () => {
		switch (step) {
			case 'duration':
				setStep('availability')
				break
			case 'upload':
				setStep('duration')
				break
			case 'details':
				setStep('upload')
				break
			case 'review':
				setStep('details')
				break
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[600px]">
				<DialogHeader>
					<DialogTitle>Purchase Ad Space</DialogTitle>
					<DialogDescription>
						{step === 'availability' && 'Check if the ad slot is available'}
						{step === 'duration' && 'Select how long you want your ad to run'}
						{step === 'upload' && 'Upload your banner image'}
						{step === 'details' && 'Add optional details'}
						{step === 'review' && 'Review and confirm your purchase'}
					</DialogDescription>
				</DialogHeader>

				<div className="py-4 min-h-[300px]">
					{step === 'availability' && (
						<div className="space-y-4">
							{availability?.available ? (
								<Alert>
									<AlertDescription>🎉 Ad slot is available! You can purchase it now.</AlertDescription>
								</Alert>
							) : (
								<div className="space-y-2">
									<Alert variant="destructive">
										<AlertDescription>
											Ad slot is currently occupied. It will be available after:
										</AlertDescription>
									</Alert>
									<p className="text-sm text-muted-foreground">
										{availability?.availableAt &&
											new Date(availability.availableAt).toLocaleString()}
									</p>
								</div>
							)}
						</div>
					)}

					{step === 'duration' && (
						<div className="space-y-4">
							<div className="grid gap-4">
								{(Object.entries(PRICING) as Array<[keyof typeof PRICING, typeof PRICING[keyof typeof PRICING]]>).map(
									([key, value]) => (
										<Button
											key={key}
											variant={selectedDuration === key ? 'default' : 'outline'}
											onClick={() => setSelectedDuration(key)}
											className="w-full justify-start h-auto py-3"
										>
											<div className="flex items-center justify-between w-full">
												<div className="flex items-center gap-2">
													<Clock className="h-4 w-4" />
													<span className="font-semibold">{value.label}</span>
												</div>
												{value.price === 0 ? (
													<span className="text-green-600 font-bold">FREE</span>
												) : (
													<span className="font-semibold">${value.price}</span>
												)}
											</div>
										</Button>
									),
								)}
							</div>
						</div>
					)}

					{step === 'upload' && (
						<div className="space-y-4">
							<Alert>
								<AlertDescription>
									Upload a banner image. Recommended size: 1200x200px. Max size: 2MB
								</AlertDescription>
							</Alert>
							<div>
								<Label htmlFor="image-upload">Banner Image</Label>
								<Input
									id="image-upload"
									type="file"
									accept="image/*"
									onChange={handleImageUpload}
									className="mt-2"
								/>
							</div>
							{preview && (
								<div className="mt-4">
									<p className="text-sm text-muted-foreground mb-2">Preview:</p>
									<img src={preview} alt="Banner preview" className="w-full h-auto rounded border" />
								</div>
							)}
						</div>
					)}

					{step === 'details' && (
						<div className="space-y-4">
							<div>
								<Label htmlFor="title">Ad Title (Optional)</Label>
								<Input
									id="title"
									placeholder="Your ad title"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									className="mt-2"
								/>
							</div>
							<div>
								<Label htmlFor="link-url">Link URL (Optional)</Label>
								<Input
									id="link-url"
									type="url"
									placeholder="https://example.com"
									value={linkUrl}
									onChange={(e) => setLinkUrl(e.target.value)}
									className="mt-2"
								/>
								<p className="text-xs text-muted-foreground mt-1">
									Where users will be redirected when clicking your banner
								</p>
							</div>
						</div>
					)}

					{step === 'review' && selectedDuration && (
						<div className="space-y-4">
							<Alert>
								<AlertDescription>
									<DollarSign className="h-4 w-4 inline mr-2" />
									{PRICING[selectedDuration].price === 0
										? 'This is a free test ad'
										: `Total: $${PRICING[selectedDuration].price}`}
								</AlertDescription>
							</Alert>
							<div className="space-y-2">
								<p className="text-sm">
									<strong>Duration:</strong> {PRICING[selectedDuration].label}
								</p>
								{title && (
									<p className="text-sm">
										<strong>Title:</strong> {title}
									</p>
								)}
								{linkUrl && (
									<p className="text-sm">
										<strong>Link:</strong>{' '}
										<a href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-primary">
											{linkUrl} <ExternalLink className="h-3 w-3 inline" />
										</a>
									</p>
								)}
							</div>
							{preview && (
								<div>
									<p className="text-sm text-muted-foreground mb-2">Your banner:</p>
									<img src={preview} alt="Banner preview" className="w-full h-auto rounded border" />
								</div>
							)}
						</div>
					)}
				</div>

				<DialogFooter className="flex-col sm:flex-row justify-between gap-2">
					{step !== 'availability' && (
						<Button variant="outline" onClick={handleBack} disabled={checkoutMutation.isPending}>
							Back
						</Button>
					)}
					<div className="flex gap-2">
						<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={checkoutMutation.isPending}>
							Cancel
						</Button>
						<Button
							onClick={handleNext}
							disabled={
								checkoutMutation.isPending ||
								(step === 'availability' && !availability?.available) ||
								(step === 'duration' && !selectedDuration) ||
								(step === 'upload' && !imageUrl) ||
								(step === 'review' && checkoutMutation.isPending)
							}
						>
							{step === 'review' ? 'Purchase' : 'Next'}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
