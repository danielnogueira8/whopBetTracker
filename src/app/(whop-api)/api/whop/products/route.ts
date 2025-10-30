import { NextRequest } from "next/server"
import { verifyUserToken } from "@whop/api"
import { whop } from "~/lib/whop"

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const experienceId = searchParams.get("experienceId")
    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 })
    }

    // Dev bridge: allow dev token via query or header
    const devToken = searchParams.get('whop-dev-user-token') || req.headers.get('whop-dev-user-token')
    const headersForVerify = devToken
      ? new Headers({ authorization: `Bearer ${devToken}` })
      : req.headers

    // Verify user
    const tokenInfo = await verifyUserToken(headersForVerify)
    const verifiedUserId = tokenInfo?.userId
    if (!verifiedUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    // Get the companyId for this experience
    const exp = await whop.experiences.getExperience({ experienceId })
    const companyId = exp?.company?.id
    if (!companyId) return Response.json({ products: [] })

    // Prefer payments.listProductsForCompany (most universal), then companies.listAccessPasses, then products.listProducts, then exp.products
    let nodes: any[] = []
    let source: string | null = null

    // 1) Payments API
    try {
      const list = await (whop as any)?.payments?.listProductsForCompany?.({ companyId })
      const arr = list?.products?.nodes ?? []
      if (arr?.length) {
        nodes = arr
        source = 'payments.listProductsForCompany'
      }
    } catch {}

    // 2) Company access passes
    if (!nodes?.length) {
      try {
        const passes = await (whop as any)?.companies?.listAccessPasses?.({ companyId })
        const arr = passes?.accessPasses?.nodes ?? []
        if (arr?.length) {
          nodes = arr
          source = 'companies.listAccessPasses'
        }
      } catch {}
    }

    // 3) Products API
    if (!nodes?.length) {
      try {
        const listResp = await (whop as any)?.products?.listProducts?.({ companyId })
        const arr = listResp?.products?.nodes ?? []
        if (arr?.length) {
          nodes = arr
          source = 'products.listProducts'
        }
      } catch {}
    }

    // 4) Experience products as last resort (may be empty for non-owner viewers)
    if (!nodes?.length) {
      const expProducts = (exp as any)?.products ?? []
      nodes = expProducts
      if (nodes?.length) source = 'experience.products'
    }

    const products = nodes.map((p: any) => ({
      id: p?.id ?? "",
      title: p?.title ?? "",
      route: p?.route ?? "",
    }))

    // Debug mode
    if (searchParams.get('debug') === '1') {
      const headerKeys = Array.from(req.headers.keys())
      return Response.json({
        debug: true,
        verifiedUserId,
        host: req.headers.get('host'),
        xForwardedHost: req.headers.get('x-forwarded-host'),
        referer: req.headers.get('referer'),
        headerKeys,
        count: products.length,
        source,
      })
    }

    return Response.json({ products })
  } catch (error) {
    console.error("Error listing products:", error)
    return Response.json({ error: "Failed to list products" }, { status: 500 })
  }
}


