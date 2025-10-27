'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Gem, BarChart3, User, Trophy, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'

interface AdminOnboardingDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function AdminOnboardingDialog({ open, onOpenChange }: AdminOnboardingDialogProps) {
	const [step, setStep] = useState(1)

	const completeOnboarding = useMutation({
		mutationFn: async () => {
			const response = await fetch('/api/user-stats/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			})
			if (!response.ok) throw new Error('Failed to complete onboarding')
			return response.json()
		},
		onSuccess: () => {
			onOpenChange(false)
		},
	})

	const handleNext = () => {
		if (step < 4) {
			setStep(step + 1)
		} else {
			completeOnboarding.mutate()
		}
	}

	const handleSkip = () => {
		completeOnboarding.mutate()
	}

	const handlePrevious = () => {
		if (step > 1) {
			setStep(step - 1)
		}
	}

	const steps = [
		{
			title: 'Welcome to Bet Tracker!',
			description: 'Your complete betting management system',
			icon: <Gem className="h-12 w-12 text-primary mb-4" />,
			content: (
				<div className="space-y-4">
					<p className="text-center text-muted-foreground">
						Build and manage your betting community with powerful tracking and analytics tools.
					</p>
					<ul className="space-y-2 text-sm text-muted-foreground">
						<li className="flex items-center gap-2">
							<ArrowRight className="h-4 w-4" />
							Create picks for your community
						</li>
						<li className="flex items-center gap-2">
							<ArrowRight className="h-4 w-4" />
							Track bets and performance analytics
						</li>
						<li className="flex items-center gap-2">
							<ArrowRight className="h-4 w-4" />
							Manage leaderboards and user stats
						</li>
					</ul>
				</div>
			),
		},
		{
			title: 'Create Community Picks',
			description: 'Share your picks with your community',
			icon: <BarChart3 className="h-12 w-12 text-primary mb-4" />,
			content: (
				<div className="space-y-4">
					<p className="text-center text-muted-foreground">
						Use the Community Picks section to create picks that all your members can see and follow.
					</p>
					<ul className="space-y-2 text-sm text-muted-foreground">
						<li className="flex items-center gap-2">
							<Gem className="h-4 w-4 text-primary" />
							Click the "Create New Pick" button
						</li>
						<li className="flex items-center gap-2">
							<Gem className="h-4 w-4 text-primary" />
							Add game details, odds, and explanations
						</li>
						<li className="flex items-center gap-2">
							<Gem className="h-4 w-4 text-primary" />
							Set event dates for future picks
						</li>
					</ul>
				</div>
			),
		},
		{
			title: 'Track Bets & Analytics',
			description: 'Monitor your community betting activity',
			icon: <Trophy className="h-12 w-12 text-primary mb-4" />,
			content: (
				<div className="space-y-4">
					<p className="text-center text-muted-foreground">
						View comprehensive analytics for your entire community's betting activity.
					</p>
					<ul className="space-y-2 text-sm text-muted-foreground">
						<li className="flex items-center gap-2">
							<BarChart3 className="h-4 w-4 text-primary" />
							Community Bets: Track all community wagers
						</li>
						<li className="flex items-center gap-2">
							<User className="h-4 w-4 text-primary" />
							My Bet Tracker: Your personal betting log
						</li>
						<li className="flex items-center gap-2">
							<Trophy className="h-4 w-4 text-primary" />
							Analytics: Win rates, ROI, and trends
						</li>
					</ul>
				</div>
			),
		},
		{
			title: 'Global Leaderboard',
			description: 'See who\'s performing best',
			icon: <User className="h-12 w-12 text-primary mb-4" />,
			content: (
				<div className="space-y-4">
					<p className="text-center text-muted-foreground">
						The Global Leaderboard automatically ranks users based on their betting performance.
					</p>
					<ul className="space-y-2 text-sm text-muted-foreground">
						<li className="flex items-center gap-2">
							<Trophy className="h-4 w-4 text-primary" />
							Rankings based on win rate and ROI
						</li>
						<li className="flex items-center gap-2">
							<Trophy className="h-4 w-4 text-primary" />
							Track top performers in your community
						</li>
						<li className="flex items-center gap-2">
							<Trophy className="h-4 w-4 text-primary" />
							Encourage healthy competition
						</li>
					</ul>
				</div>
			),
		},
	]

	const currentStep = steps[step - 1]

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader className="pt-6 pb-4">
					<div className="flex justify-center mb-4">{currentStep.icon}</div>
					<DialogTitle>{currentStep.title}</DialogTitle>
					<DialogDescription>{currentStep.description}</DialogDescription>
				</DialogHeader>
				<div className="py-2 min-h-[200px]">{currentStep.content}</div>
				<div className="flex items-center justify-center gap-2 pb-4">
					{steps.map((_, i) => (
						<div
							key={i}
							className={`h-2 w-2 rounded-full transition-colors ${
								i + 1 === step ? 'bg-primary' : 'bg-muted'
							}`}
						/>
					))}
				</div>
				<DialogFooter className="flex-col sm:flex-row justify-between gap-2 pb-4">
					<Button variant="ghost" onClick={handleSkip} disabled={completeOnboarding.isPending}>
						Skip
					</Button>
					<div className="flex gap-2">
						<Button
							variant="outline"
							onClick={handlePrevious}
							disabled={step === 1 || completeOnboarding.isPending}
						>
							<ChevronLeft className="mr-2 h-4 w-4" />
							Previous
						</Button>
						<Button onClick={handleNext} disabled={completeOnboarding.isPending}>
							{step === steps.length ? 'Get Started' : 'Next'}
							{step < steps.length && <ChevronRight className="ml-2 h-4 w-4" />}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
