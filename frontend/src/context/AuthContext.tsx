import React, { createContext, useContext, useEffect, useState } from 'react'
import { api, getAuthToken, setAuthToken } from '../services/api'
import type { AuthResponse, ProfileUpdatePayload, RegisterPayload, UserProfile } from '../types/api'

interface AuthContextType {
  user: UserProfile | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<AuthResponse>
  logout: () => void
  register: (payload: RegisterPayload) => Promise<AuthResponse>
  verifyEmail: (email: string, otp_code: string) => Promise<AuthResponse>
  updateProfile: (payload: ProfileUpdatePayload) => Promise<UserProfile>
  deleteAccount: (password?: string) => Promise<{ status: string; message: string }>
  quickDemoLogin: (role: 'CUSTOMER' | 'CONSUMER' | 'RECYCLER' | 'ADMIN') => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [token, setToken] = useState<string | null>(getAuthToken())
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    async function loadUser() {
      const activeToken = getAuthToken()
      if (!activeToken) {
        setIsLoading(false)
        return
      }

      try {
        const profile = await api.getMe()
        setUser(profile)
        setToken(activeToken)
      } catch {
        // Token expired or invalid
        setAuthToken(null)
        setToken(null)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadUser()
  }, [])

  const login = async (email: string, password: string): Promise<AuthResponse> => {
    const res = await api.login({ email, password })
    if (res.access_token && res.user) {
      setAuthToken(res.access_token)
      setToken(res.access_token)
      setUser(res.user)
    }
    return res
  }

  const logout = () => {
    setAuthToken(null)
    setToken(null)
    setUser(null)
  }

  const register = async (payload: RegisterPayload): Promise<AuthResponse> => {
    return await api.register(payload)
  }

  const verifyEmail = async (email: string, otp_code: string): Promise<AuthResponse> => {
    const res = await api.verifyEmail({ email, otp_code })
    if (res.access_token && res.user) {
      setAuthToken(res.access_token)
      setToken(res.access_token)
      setUser(res.user)
    }
    return res
  }

  const updateProfile = async (payload: ProfileUpdatePayload): Promise<UserProfile> => {
    const res = await api.updateCustomerProfile(payload)
    setUser(res.user)
    return res.user
  }

  const deleteAccount = async (password?: string): Promise<{ status: string; message: string }> => {
    const res = await api.deleteAccount(password ? { password } : undefined)
    setAuthToken(null)
    setToken(null)
    setUser(null)
    return res
  }

  const quickDemoLogin = async (role: 'CUSTOMER' | 'CONSUMER' | 'RECYCLER' | 'ADMIN') => {
    const map: Record<string, string> = {
      CUSTOMER: 'customer@evolve.ai',
      CONSUMER: 'consumer@evolve.ai',
      RECYCLER: 'recycler@evolve.ai',
      ADMIN: 'admin@evolve.ai',
    }
    const email = map[role]
    await login(email, 'Evolve@2026')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
        register,
        verifyEmail,
        updateProfile,
        deleteAccount,
        quickDemoLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
