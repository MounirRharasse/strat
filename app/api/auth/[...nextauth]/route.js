import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

const handler = NextAuth({
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
  secret: process.env.NEXTAUTH_SECRET
})

export { handler as GET, handler as POST }