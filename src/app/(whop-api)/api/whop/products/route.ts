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

    // Scoped SDK (ensures calls are made on behalf of the verified user within the company)
    const scoped = (whop as any)?.withUser?.(verifiedUserId)?.withCompany?.(companyId) ?? whop

    // List access passes / products for the company (includes hidden/non-discoverable)
    // Prefer company access passes, then fall back to products APIs, then experience products.
    let nodes: any[] = []
    try {
      const passes = await (scoped as any)?.companies?.listAccessPasses?.({ companyId })
      nodes = passes?.accessPasses?.nodes ?? []
    } catch {}
    if (!nodes?.length) {
      const listResp = (
        (await (scoped as any)?.products?.listProducts?.({ companyId })) ??
        (await (scoped as any)?.payments?.listProductsForCompany?.({ companyId })) ??
        null
      ) as any
      nodes = listResp?.products?.nodes ?? []
    }
    if (!nodes?.length) {
      const expProducts = (exp as any)?.products ?? []
      nodes = expProducts
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
      })
    }

    return Response.json({ products })
  } catch (error) {
    console.error("Error listing products:", error)
    return Response.json({ error: "Failed to list products" }, { status: 500 })
  }
}


