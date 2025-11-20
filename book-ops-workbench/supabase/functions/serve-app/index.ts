// WARNING: This is NOT recommended for production
// Use Vercel/Netlify instead for better performance and features

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  // This would need to serve your built React app
  // But it's complex, not optimized, and defeats the purpose of a SPA

  return new Response(
    "Please deploy your frontend to Vercel or Netlify instead",
    { status: 501 }
  )
})
