'use client'

import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'
import type { WhopAccess, WhopExperience, WhopUser } from './whop'

interface WhopContextValue {
	experience: WhopExperience | undefined
	user: WhopUser | undefined
	access: WhopAccess | undefined
	isLoading: boolean
}

const WhopContext = createContext<WhopContextValue | null>(null)

const whopExperienceQuery = (experienceId: string) => ({
	queryKey: ['experience', experienceId],
	queryFn: async () => {
		const response = await fetch(`/api/experience/${experienceId}`)
		if (!response.ok) throw new Error('Failed to fetch whop experience')
		const result = (await response.json()) as WhopExperience
		return result
	},
	staleTime: 5 * 60 * 1000, // 5 minutes
})

const whopUserQuery = (experienceId: string) => ({
	queryKey: ['user', experienceId],
	queryFn: async () => {
		const response = await fetch(`/api/experience/${experienceId}/user`)
		if (!response.ok) throw new Error('Failed to fetch whop user')
		return response.json() as Promise<{ user: WhopUser; access: WhopAccess }>
	},
	staleTime: 5 * 60 * 1000, // 5 minutes
})

export function WhopProvider({ children, experienceId }: { children: ReactNode; experienceId: string }) {
	const { data: experience, isLoading: isLoadingExperience } = useQuery(whopExperienceQuery(experienceId))
	const { data: userAccessData, isLoading: isLoadingUser } = useQuery(whopUserQuery(experienceId))

	const isLoading = isLoadingExperience || isLoadingUser

	return (
		<WhopContext.Provider
			value={{
				experience,
				user: userAccessData?.user,
				access: userAccessData?.access,
				isLoading,
			}}
		>
			{children}
		</WhopContext.Provider>
	)
}

export function useWhop(): WhopContextValue {
	const context = useContext(WhopContext)
	if (!context) throw new Error('useWhop must be used within a WhopProvider')
	return context
}
