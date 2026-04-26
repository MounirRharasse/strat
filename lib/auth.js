import CredentialsProvider from 'next-auth/providers/credentials'
import { getServerSession } from 'next-auth/next'
import { getToken } from 'next-auth/jwt'

// TODO V1+ : remplacer par un lookup DB sur l'email du user
// (ex. table `users` avec colonne `parametre_id`).
// En V1 mono-tenant, tous les users sont mappés sur Krousty.
const PARAMETRE_ID_KROUSTY = '68f417f5-b3ea-4b8b-98ea-29b752076e8c'

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Strat',
      credentials: {
        username: { label: 'Identifiant', type: 'text' },
        password: { label: 'Mot de passe', type: 'password' }
      },
      async authorize(credentials) {
        if (
          credentials.username === process.env.ADMIN_USERNAME &&
          credentials.password === process.env.ADMIN_PASSWORD
        ) {
          return { id: '1', name: 'Mounir', email: 'mounir@krousty.fr' }
        }
        return null
      }
    })
  ],
  pages: {
    signIn: '/login'
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      // user est défini au premier login uniquement.
      // La 2e condition assure la migration douce des cookies existants
      // qui n'avaient pas parametre_id avant ce déploiement.
      if (user || !token.parametre_id) {
        token.parametre_id = PARAMETRE_ID_KROUSTY
      }
      return token
    },
    async session({ session, token }) {
      session.user.parametre_id = token.parametre_id
      return session
    }
  }
}

export async function getParametreIdFromSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.parametre_id) {
    throw new Error('Session manquante ou parametre_id non défini')
  }
  return session.user.parametre_id
}

export async function getParametreIdFromRequest(request) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  return token?.parametre_id ?? null
}
