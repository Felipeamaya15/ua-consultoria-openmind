import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { formatPrice, Product, ProductVariant } from "../data/mockAdminData"
import { createPublicProduct, deleteCatalogProduct, fetchAdminProducts, fetchAdminProduct, updateCatalogProduct, type AdminProduct } from "../services/productService"
import { Alert, Badge, Button, Input, Tabs, Textarea, Toggle } from "../components/ui"

const productStatus = (status: Product["status"]) => ({
  active: <Badge variant="success">Activo</Badge>, archived: <Badge variant="default">Archivado</Badge>, draft: <Badge variant="warning">Borrador</Badge>,
})[status]
const stockState = (stock: number) => stock === 0 ? { label: "Sin stock", color: "bg-red-500", badge: "error" as const } : stock <= 5 ? { label: "Stock bajo", color: "bg-amber-500", badge: "warning" as const } : { label: "Disponible", color: "bg-emerald-500", badge: "success" as const }
const variantAttributes = (variant: ProductVariant) =>
  Object.entries(variant.attributes)
    .map(([name, value]) => `${name}: ${value}`)
    .join(" · ") || "Sin atributos"

export function ProductList() {
  const [search, setSearch] = useState("")
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    fetchAdminProducts().then(data => { if (active) setProducts(data) })
      .catch(error => { if (active) setError(error.message || "No se pudo cargar el catálogo") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const filtered = products.filter((product) => `${product.name} ${product.category} ${product.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase()))

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm("¿Estás seguro de que deseas desactivar este producto? Dejará de ser visible en el catálogo, pero se mantendrá en tu historial de ventas.")) return;

    try {
      await deleteCatalogProduct(productId);

      setProducts(current => current.map(p => p.id === productId ? { ...p, status: "archived" } : p));
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo eliminar el producto.");
    }
  };
  return <div>
    {loading && <Alert variant="info">Cargando productos reales…</Alert>}
    {error && <Alert variant="error">{error}</Alert>}
    <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
      <div>
        <h2 className="font-semibold">Productos</h2>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">Gestiona catalogo, atributos, variantes, SKU e inventario.</p>
      </div>
      <Link to="/emprendedor/productos/nuevo"><Button variant="primary" size="sm">+ Nuevo producto</Button></Link>
    </div>
    <Input aria-label="Buscar productos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, categoria o etiqueta..." className="max-w-md mb-4" />
    <div className="bg-white border border-[var(--border)] rounded-xl overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
            {["Producto", "Variantes", "Categoria", "Precio", "Stock", "Estado", "Acciones"].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {filtered.map((product) => {
            const stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0)
            const state = stockState(stock)

            return <tr key={product.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/30 align-top">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <img src={product.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover bg-[var(--muted)]" />
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{product.variants.length} variantes</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="grid gap-2 max-w-sm">
                  {product.variants.map((variant) => {
                    const variantState = stockState(variant.stock)

                    return <div key={variant.id} className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold">{variant.sku}</span>
                        <Badge variant={variantState.badge}>{variant.stock} uds</Badge>
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{variantAttributes(variant)}</p>
                    </div>
                  })}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">{product.category}</td>
              <td className="px-4 py-3 font-semibold">{formatPrice(product.basePrice)}</td>
              <td className="px-4 py-3"><div className="min-w-28"><div className="flex justify-between text-xs mb-1"><span>{stock} uds</span><Badge variant={state.badge}>{state.label}</Badge></div><div className="h-1.5 bg-[var(--muted)] rounded-full overflow-hidden"><div className={`${state.color} h-full rounded-full`} style={{ width: `${Math.min(100, stock * 2)}%` }} /></div></div></td>
              <td className="px-4 py-3">{productStatus(product.status)}</td>
              <td className="px-4 py-3"><div className="flex items-center gap-3"><Link to={`/emprendedor/productos/${product.id}`} className="text-xs font-semibold text-[var(--primary)] hover:underline">Editar</Link><button onClick={() => handleDeleteProduct(product.id)} className="text-xs font-semibold text-[var(--error)] hover:underline">Eliminar</button></div></td>
            </tr>
          })}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">No encontramos productos con esa busqueda.</p>}
    </div>
  </div>
}

const blankProduct = (): AdminProduct => ({ id: "", name: "", description: "", category: "Ropa", images: [], basePrice: 0, variants: [], attributes: {}, tags: [], featured: false, status: "draft", createdAt: new Date().toISOString() })

export function ProductForm() {
  const { id } = useParams()
  const [loaded, setLoaded] = useState<AdminProduct | null>(null)
  const [loadError, setLoadError] = useState("")
  const [loading, setLoading] = useState(id !== "nuevo")
  useEffect(() => {
    let active = true
    setLoaded(null); setLoadError(""); setLoading(id !== "nuevo")
    if (id !== "nuevo") {
      fetchAdminProduct(id ?? "").then(product => { if (active) setLoaded(product) })
        .catch(error => { if (active) setLoadError(error.message || "No se pudo cargar el producto") })
        .finally(() => { if (active) setLoading(false) })
    }
    return () => { active = false }
  }, [id])
  if (id !== "nuevo" && (loading || (loaded && loaded.id !== id))) return <Alert variant="info">Cargando producto real…</Alert>
  if (id !== "nuevo" && !loaded) return <Alert variant="error">{loadError || "Producto no encontrado"}. <Link to="/emprendedor/productos">Volver al catálogo real</Link></Alert>
  return <ProductEditor key={id} initial={loaded ?? blankProduct()} editing={id !== "nuevo"} />
}

export function ProductEditor({ initial, editing }: { initial: AdminProduct; editing: boolean }) {
  const navigate = useNavigate(); const imageInput = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState("info"); const [saved, setSaved] = useState(false); const [saving, setSaving] = useState(false)
  const [product, setProduct] = useState<AdminProduct>({ ...initial, images: [...initial.images], variants: initial.variants.map((variant) => ({ ...variant, attributes: { ...variant.attributes } })), attributes: { ...initial.attributes }, tags: [...initial.tags] })
  const [error, setError] = useState("");
  const [products, setCatalogProducts] = useState<AdminProduct[]>([])
  useEffect(() => {
    let active = true
    fetchAdminProducts().then(data => { if (active) setCatalogProducts(data) })
      .catch(() => {}) // La unicidad entre productos también se valida en el backend.
    return () => { active = false }
  }, [])

  const variants = product.variants; const attributeNames = Object.keys(product.attributes); const totalStock = useMemo(() => variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock) || 0), 0), [variants])
  const normalizeSku = (sku: string) => sku.trim().toUpperCase()
  const generateSku = (currentVariants: ProductVariant[] = product.variants) => {
    const used = new Set([...products.flatMap((item) => item.variants), ...currentVariants].map((variant) => normalizeSku(variant.sku)).filter(Boolean))
    let index = 1
    let sku = `SKU-${index}`
    while (used.has(sku)) {
      index += 1
      sku = `SKU-${index}`
    }
    return sku
  }
  const findDuplicatedSku = () => { const seen = new Set<string>(); for (const variant of product.variants) { const sku = variant.sku.trim().toUpperCase(); if (!sku) continue; if (seen.has(sku)) return sku; seen.add(sku); } const currentProductId = product.id; const usedByOtherProduct = new Set(products.filter((item) => item.id !== currentProductId).flatMap((item) => item.variants.map((variant) => variant.sku.trim().toUpperCase()).filter(Boolean))); return [...seen].find((sku) => usedByOtherProduct.has(sku)); }
  const setField = <K extends keyof AdminProduct>(key: K, value: AdminProduct[K]) => setProduct((current) => ({ ...current, [key]: value }))
  const updateVariant = (variantId: string, change: Partial<ProductVariant>) => setProduct((current) => ({ ...current, variants: current.variants.map((variant) => variant.id === variantId ? { ...variant, ...change } : variant) }))
  const updateAttribute = (name: string, values: string) => setProduct((current) => ({ ...current, attributes: { ...current.attributes, [name]: values.split(",").map((value) => value.trim()).filter(Boolean) } }))
  const addAttribute = () => {
    let index = attributeNames.length + 1
    while (product.attributes[`Atributo ${index}`]) index++
    const name = `Atributo ${index}`
    setProduct(current => ({ ...current, attributes: { ...current.attributes, [name]: ["Opción 1"] },
      variants: current.variants.map(variant => ({ ...variant, attributes: { ...variant.attributes, [name]: "Opción 1" } })) }))
  }
  const renameAttribute = (oldName: string, newName: string) => { if (!newName.trim() || newName === oldName) return; if (product.attributes[newName]) { setError("Ya existe un atributo con ese nombre."); return; } setProduct((current) => { const attributes = { ...current.attributes }; const values = attributes[oldName]; delete attributes[oldName]; attributes[newName] = values; return { ...current, attributes, variants: current.variants.map((variant) => { const next = { ...variant.attributes, [newName]: variant.attributes[oldName] ?? values[0] ?? "" }; delete next[oldName]; return { ...variant, attributes: next } }) } }) }
  const addVariant = () => setProduct((current) => ({ ...current, variants: [...current.variants, { id: `v-${Date.now()}`, sku: generateSku(current.variants), attributes: Object.fromEntries(Object.entries(current.attributes).map(([name, values]) => [name, values[0] ?? ""])), price: current.basePrice, comparePrice: current.comparePrice, stock: 0, available: true }] }))
  const addImages = (files?: FileList | null) => { if (!files) return; if(Array.from(files).some(file => file.size > 1024 * 1024 || !["image/png","image/jpeg","image/webp"].includes(file.type))) {setError("Usa imágenes JPG, PNG o WebP de hasta 1 MB.");return;} Array.from(files).filter((file) => file.type.startsWith("image/")).forEach((file) => { const reader = new FileReader(); reader.onload = () => setProduct((current) => ({ ...current, images: [...current.images, String(reader.result)] })); reader.readAsDataURL(file) }) }
  const save = async () => {
    if (!product.name.trim()) { setError("Ingresa el nombre del producto."); setActiveTab("info"); return; }
    if (product.variants.length === 0) { setError("Agrega al menos una variante con precio y stock."); setActiveTab("variants"); return; }
    const duplicatedSku = findDuplicatedSku();
    if(product.basePrice < 0 || product.variants.some(v => !v.sku.trim() || v.price < 0 || !Number.isInteger(v.stock) || v.stock < 0) || duplicatedSku) {setError(duplicatedSku ? `El SKU ${duplicatedSku} ya existe en otra variante o producto.` : "Revisa los precios, el stock entero y los SKU únicos de las variantes.");setActiveTab("variants");return;}

    const finalProduct = { ...product, basePrice: Number(product.basePrice) || 0 };


    setSaving(true);
    setError("");

    setSaved(false);
    try {
      if (editing) {
        const persisted = await updateCatalogProduct(finalProduct);
        setProduct(persisted);
      } else {
        const id = await createPublicProduct(finalProduct);
        setProduct(current => ({ ...current, id }));
      }
      setSaved(true);
      setTimeout(() => navigate("/emprendedor/productos"), 800);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  };
  const removeImage = (index: number) => setProduct((current) => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) }))
  return <div>
    {error && <div className="mb-4"><Alert variant="error">{error}</Alert></div>}
    <div className="flex items-center justify-between mb-5 flex-wrap gap-3"><div className="flex items-center gap-3"><button onClick={() => navigate("/emprendedor/productos")} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Volver</button><h2 className="font-semibold">{editing ? "Editar producto" : "Nuevo producto"}</h2></div><div className="flex gap-2">{saved && <span className="text-sm text-[var(--success)]">✓ Guardado</span>}<Button variant="primary" size="sm" onClick={save} disabled={saving || saved}>{saving ? "Guardando..." : "Guardar producto"}</Button></div></div>
    <Tabs tabs={[{ id: "info", label: "Información" }, { id: "variants", label: `Variantes (${variants.length})` }, { id: "images", label: `Imágenes (${product.images.length})` }, { id: "seo", label: "SEO" }]} active={activeTab} onChange={setActiveTab} />
    {activeTab === "info" && <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5"><div className="lg:col-span-2 flex flex-col gap-5"><div className="bg-white border border-[var(--border)] rounded-xl p-5 flex flex-col gap-4"><Input label="Nombre del producto" value={product.name} onChange={(event) => setField("name", event.target.value)} placeholder="Ej: Polera Esencial" required /><Textarea label="Descripción" value={product.description} onChange={(event) => setField("description", event.target.value)} placeholder="Describe el producto…" /><div className="grid sm:grid-cols-2 gap-4"><Input label="Precio base (CLP)" type="number" value={product.basePrice || ""} onChange={(event) => setField("basePrice", Number(event.target.value))} /><Input label="Precio anterior (opcional)" type="number" value={product.comparePrice ?? ""} onChange={(event) => setField("comparePrice", event.target.value ? Number(event.target.value) : undefined)} /></div></div><div className="bg-white border border-[var(--border)] rounded-xl p-5"><div className="flex justify-between gap-3 mb-4"><div><p className="font-semibold text-sm">Atributos personalizados</p><p className="text-xs text-[var(--muted-foreground)]">Color, talla, material o cualquier característica.</p></div><Button variant="secondary" size="sm" onClick={addAttribute}>+ Atributo</Button></div><div className="grid gap-3">{attributeNames.map((name) => <div key={name} className="grid sm:grid-cols-2 gap-3 border-b border-[var(--border)] pb-3 last:border-0"><Input label="Nombre" defaultValue={name} onBlur={(event) => renameAttribute(name, event.target.value)} /><Input label="Opciones, separadas por coma" defaultValue={product.attributes[name].join(", ")} onBlur={(event) => updateAttribute(name, event.target.value)} /></div>)}{attributeNames.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Aún no hay atributos. Agrégalos para crear variantes combinables.</p>}</div></div></div><div className="flex flex-col gap-5"><div className="bg-white border border-[var(--border)] rounded-xl p-5 flex flex-col gap-4"><Input label="Categoría" value={product.category} onChange={(event) => setField("category", event.target.value)} /><Input label="Etiquetas" defaultValue={product.tags.join(", ")} onBlur={(event) => setField("tags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} hint="Separadas por coma" /><Toggle checked={product.featured} onChange={(featured) => setField("featured", featured)} label="Producto destacado" /></div><div className="bg-white border border-[var(--border)] rounded-xl p-5"><p className="font-semibold text-sm mb-3">Estado de publicación</p>{(["active", "draft", "archived"] as const).map((status) => <label key={status} className="flex gap-2 py-1.5 text-sm capitalize"><input type="radio" checked={product.status === status} onChange={() => setField("status", status)} />{status === "active" ? "Activo" : status === "draft" ? "Borrador" : "Archivado"}</label>)}</div></div></div>}
    {activeTab === "info" && <div className="mt-5 bg-white border border-[var(--border)] rounded-xl p-5">
      <p className="font-semibold text-sm mb-3">Características generales</p>
      {(product.generalAttributes ?? []).map((attribute, index) => <div key={index} className="flex flex-wrap gap-3 mb-3">
        {(["clave", "etiqueta", "valor"] as const).map(field => <Input key={field} label={field} value={attribute[field]} onChange={event => setField("generalAttributes", (product.generalAttributes ?? []).map((item, i) => i === index ? { ...item, [field]: event.target.value } : item))} />)}
        <button onClick={() => setField("generalAttributes", product.generalAttributes?.filter((_, i) => i !== index))}>Eliminar</button>
      </div>)}
      <Button onClick={() => setField("generalAttributes", [...(product.generalAttributes ?? []), { clave: "", etiqueta: "", valor: "" }])}>+ Característica</Button>
    </div>}
    {activeTab === "variants" && <div className="mt-5 bg-white border border-[var(--border)] rounded-xl p-5"><div className="flex items-start justify-between gap-3 mb-5"><div><p className="font-semibold text-sm">Variantes, SKU e inventario</p><p className="text-xs text-[var(--muted-foreground)] mt-1">Stock total: <strong>{totalStock} unidades</strong>. Cada variante mantiene precio, SKU y disponibilidad propios.</p></div><Button variant="primary" size="sm" onClick={addVariant}>+ Agregar variante</Button></div>{variants.length ? <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr className="border-b border-[var(--border)]">{["SKU", "Atributos", "Precio", "Stock", "Estado", ""].map((title) => <th key={title} className="text-left py-2 px-2 text-xs text-[var(--muted-foreground)] uppercase">{title}</th>)}</tr></thead><tbody>{variants.map((variant) => <tr key={variant.id} className="border-b border-[var(--border)] last:border-0 align-top"><td className="p-2"><input className="w-28 border border-[var(--border)] rounded px-2 py-1.5 text-xs font-mono" value={variant.sku} onChange={(event) => updateVariant(variant.id, { sku: event.target.value })} /></td><td className="p-2"><div className="grid gap-1">{attributeNames.map((name) => <label key={name} className="flex items-center gap-1 text-xs"><span className="w-14 text-[var(--muted-foreground)]">{name}</span><select className="border border-[var(--border)] rounded px-1 py-1" value={variant.attributes[name] ?? ""} onChange={(event) => updateVariant(variant.id, { attributes: { ...variant.attributes, [name]: event.target.value } })}>{(product.attributes[name] ?? []).map((value) => <option key={value}>{value}</option>)}</select></label>)}</div></td><td className="p-2"><input type="number" className="w-24 border border-[var(--border)] rounded px-2 py-1.5" value={variant.price} onChange={(event) => updateVariant(variant.id, { price: Number(event.target.value) })} /><input aria-label="Precio anterior de variante" placeholder="Precio anterior" type="number" className="w-24 border rounded px-2 py-1.5 mt-1" value={variant.comparePrice ?? ""} onChange={event => updateVariant(variant.id, { comparePrice: event.target.value ? Number(event.target.value) : undefined })} /></td><td className="p-2"><input type="number" min="0" className="w-20 border border-[var(--border)] rounded px-2 py-1.5" value={variant.stock} onChange={(event) => updateVariant(variant.id, { stock: Number(event.target.value) })} /><div className="mt-1"><Badge variant={stockState(variant.stock).badge}>{stockState(variant.stock).label}</Badge></div></td><td className="p-2"><Badge variant={variant.stock > 0 ? "success" : "warning"}>{variant.stock > 0 ? "Con stock" : "Sin stock"}</Badge></td><td className="p-2"><button onClick={() => setProduct((current) => ({ ...current, variants: current.variants.filter((item) => item.id !== variant.id) }))} className="text-xs text-[var(--error)] hover:underline">Eliminar</button></td></tr>)}</tbody></table></div> : <Alert variant="info">Agrega atributos y crea la primera variante. Así cada combinación tendrá SKU y stock independientes.</Alert>}</div>}
    {activeTab === "images" && <div className="mt-5 bg-white border border-[var(--border)] rounded-xl p-5"><p className="font-semibold text-sm">Galería del producto</p><p className="text-xs text-[var(--muted-foreground)] mt-1 mb-4">La primera imagen es la principal. Puedes cargar JPG, PNG o WebP de hasta 1 MB por imagen.</p><input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(event) => addImages(event.target.files)} /><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{product.images.map((image, index) => <div key={`${image}-${index}`} className="relative aspect-square rounded-xl overflow-hidden border border-[var(--border)]"><img src={image} alt={`Producto ${index + 1}`} className="w-full h-full object-cover" />{index === 0 && <span className="absolute top-2 left-2"><Badge variant="info">Principal</Badge></span>}<button onClick={() => removeImage(index)} className="absolute bottom-2 right-2 bg-white rounded-md px-2 py-1 text-xs text-[var(--error)] shadow">Eliminar</button></div>)}<button onClick={() => imageInput.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--muted)] transition-colors flex flex-col items-center justify-center gap-2"><span className="text-2xl">＋</span><span className="text-xs">Subir imágenes</span></button></div></div>}
    {activeTab === "seo" && <div className="mt-5 bg-white border border-[var(--border)] rounded-xl p-5 max-w-2xl grid gap-4"><Input label="Meta título" value={product.seoTitle ?? ""} onChange={(event) => setField("seoTitle", event.target.value)} placeholder={product.name} /><Textarea label="Meta descripción" value={product.seoDescription ?? ""} onChange={(event) => setField("seoDescription", event.target.value)} rows={3} placeholder="Descripción breve para buscadores…" /><Alert variant="info">Estos datos se muestran en resultados de búsqueda y no modifican el texto de tu producto.</Alert></div>}
  </div>
}
