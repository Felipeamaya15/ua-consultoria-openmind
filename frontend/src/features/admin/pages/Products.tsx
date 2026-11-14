import { IMAGE_ACCEPT, prepareImage } from '../../../shared/services/imageUpload';
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react"
import { saveProductVideoResource } from '../../marketing/services/mediaLibraryService';
import { ProductVideoField } from '../components/ProductVideoField';
import { EmptyListState, LoadingState } from "../../../shared/components/states"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { emptyKind } from "../services/emptyStates"
import { formatPrice, Product, ProductVariant } from "../data/mockAdminData"
import { createPublicProduct, deleteCatalogProduct, fetchAdminProducts, fetchAdminProduct, permanentDeleteCatalogProduct, updateCatalogProduct, type AdminProduct } from "../services/productService"
import { Alert, Badge, Button, Icon, Input, Modal, Select, Tabs, Textarea, Toggle } from "../components/ui"

function OfertaInfo({ precio, anterior }: { precio: number; anterior?: number }) {
  if (anterior === undefined || anterior === null || !precio) return null
  return anterior > precio
    ? <Badge variant="success">Oferta: {Math.round((1 - precio / anterior) * 100)}% de descuento</Badge>
    : <Badge variant="warning">Sin oferta: el precio anterior debe ser mayor al precio</Badge>
}

const productStatus = (status: Product["status"]) => ({
  active: <Badge variant="success">Activo</Badge>, archived: <Badge variant="default">Desactivado</Badge>, draft: <Badge variant="warning">Borrador</Badge>,
})[status]
const stockState = (stock: number) => stock === 0 ? { label: "Sin stock", color: "bg-red-500", badge: "error" as const } : stock <= 5 ? { label: "Stock bajo", color: "bg-amber-500", badge: "warning" as const } : { label: "Disponible", color: "bg-emerald-500", badge: "success" as const }
const variantAttributes = (variant: ProductVariant) =>
  Object.entries(variant.attributes)
    .map(([name, value]) => `${name}: ${value}`)
    .join(" · ") || "Sin atributos"

export function ProductList() {
  const [search, setSearch] = useState("")
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [statusFilter, setStatusFilter] = useState("all")
  const [sort, setSort] = useState("active")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const deactivatingRef = useRef(false)
  const [deactivating, setDeactivating] = useState(false)
  const permanentDeletingRef = useRef(false)
  const [permanentlyDeleting, setPermanentlyDeleting] = useState(false)
  const [productToDelete, setProductToDelete] = useState<AdminProduct | null>(null)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("")
  const [deleteModalError, setDeleteModalError] = useState("")
  const [selectedVariantByProduct, setSelectedVariantByProduct] = useState<Record<string, string>>({})
  const location = useLocation()
  const navigate = useNavigate()
  const [successMessage, setSuccessMessage] = useState(
    (location.state as { successMessage?: string } | null)?.successMessage ?? ""
  )

  useEffect(() => {
    // Consumir el mensaje una sola vez, sin modificar manualmente el historial de React Router.
    if ((location.state as { successMessage?: string } | null)?.successMessage) {
      navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true,
        state: null,
      })
    }
  }, [location.state, location.pathname, location.search, location.hash, navigate])
  useEffect(() => {
    let active = true
    fetchAdminProducts().then(data => { if (active) setProducts(data) })
      .catch(error => { if (active) setError(error.message || "No se pudo cargar el catálogo") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const filtered = products.filter(product =>
    (statusFilter === "all" || product.status === statusFilter) &&
    `${product.name} ${product.category} ${product.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    const statusOrder = sort === "active" ? Number(b.status === "active") - Number(a.status === "active") : 0
    return statusOrder || (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  })
  const vacio = emptyKind({ loading, error, shown: filtered.length, searching: search.trim() !== "" || statusFilter !== "all" })

  const handleToggleProductStatus = async (product: AdminProduct) => {
    if (deactivatingRef.current) return;
    const isArchived = product.status === "archived";
    if (!isArchived && !window.confirm("¿Estás seguro de que deseas desactivar este producto? Dejará de ser visible en el catálogo, pero se mantendrá en tu historial de ventas.")) return;
    deactivatingRef.current = true;
    setDeactivating(true);
    setSuccessMessage("");
    try {
      if (isArchived) {
        const updated = await updateCatalogProduct({ ...product, status: "active" });
        setProducts(current => current.map(p => p.id === product.id ? updated : p));
        setError("");
        setSuccessMessage("Producto activado correctamente.");
      } else {
        await deleteCatalogProduct(product.id);
        setProducts(current => current.map(p => p.id === product.id ? { ...p, status: "archived" } : p));
        setError("");
        setSuccessMessage("Producto desactivado correctamente.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : `No se pudo ${isArchived ? "activar" : "desactivar"} el producto.`);
    } finally {
      deactivatingRef.current = false;
      setDeactivating(false);
    }
  };
  const openPermanentDeleteModal = (product: AdminProduct) => {
    if (permanentDeletingRef.current) return;
    setProductToDelete(product);
    setDeleteConfirmInput("");
    setDeleteModalError("");
  };

  const closePermanentDeleteModal = () => {
    if (permanentDeletingRef.current) return;
    setProductToDelete(null);
    setDeleteConfirmInput("");
    setDeleteModalError("");
  };

  const canConfirmPermanentDelete = deleteConfirmInput.trim().toLowerCase() === "eliminar";

  const handleConfirmPermanentDelete = async (event: FormEvent) => {
    event.preventDefault();
    if (!productToDelete || permanentDeletingRef.current || !canConfirmPermanentDelete) return;
    permanentDeletingRef.current = true;
    setPermanentlyDeleting(true);
    setDeleteModalError("");
    setSuccessMessage("");
    const targetId = productToDelete.id;
    const targetName = productToDelete.name;
    try {
      await permanentDeleteCatalogProduct(targetId, deleteConfirmInput.trim());
      setProducts(current => current.filter(p => p.id !== targetId));
      setProductToDelete(null);
      setDeleteConfirmInput("");
      setError("");
      setSuccessMessage(`Producto "${targetName}" eliminado definitivamente del catálogo. La información de ventas se conserva intacta.`);
    } catch (err) {
      setDeleteModalError(err instanceof Error ? err.message : "No se pudo eliminar definitivamente el producto.");
    } finally {
      permanentDeletingRef.current = false;
      setPermanentlyDeleting(false);
    }
  };

  const totalActive = products.filter(product => product.status === 'active').length
  const lowStock = products.filter(product => product.status === 'active' && product.variants.reduce((sum, variant) => sum + variant.stock, 0) <= 5).length
  const renderPermanentDeleteButton = (product: AdminProduct) => (
    <button
      type="button"
      onClick={() => openPermanentDeleteModal(product)}
      disabled={permanentlyDeleting}
      aria-label={`Eliminar definitivamente ${product.name}`}
      title={`Eliminar definitivamente ${product.name}`}
      className="catalog-permanent-delete-btn"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    </button>
  )
  const renderActions = (product: AdminProduct) => <div className="catalog-product-actions">
    <Link to={`/emprendedor/productos/${product.id}`} className="catalog-action-btn catalog-action-edit catalog-edit-link">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
      <span>Editar</span>
    </Link>
    <Link to={`/emprendedor/marketing?producto=${encodeURIComponent(product.id)}`} className="catalog-action-btn catalog-action-marketing">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <path d="m11 4-6 4H2v8h3l6 4v-16Z" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
      <span>Crear publicación</span>
    </Link>
    <button type="button" onClick={() => handleToggleProductStatus(product)} disabled={deactivating} className="catalog-action-btn catalog-action-delete">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
        <line x1="12" y1="2" x2="12" y2="12" />
      </svg>
      <span>{product.status === 'archived' ? 'Activar' : 'Desactivar'}</span>
    </button>
  </div>
  const getDisplayedPricing = (product: AdminProduct) => {
    const selectedId = selectedVariantByProduct[product.id];
    const selectedVariant =
      (selectedId ? product.variants.find((variant) => variant.id === selectedId) : undefined)
      ?? product.variants[0];
    const variantLabel = selectedVariant
      ? (Object.keys(selectedVariant.attributes).length > 0 ? variantAttributes(selectedVariant) : selectedVariant.sku)
      : null;
    return {
      price: selectedVariant ? selectedVariant.price : product.basePrice,
      comparePrice: selectedVariant ? selectedVariant.comparePrice : product.comparePrice,
      variantLabel,
    };
  };
  const renderVariants = (product: AdminProduct) => <details className="catalog-variants">
    <summary>{product.variants.length} {product.variants.length === 1 ? 'variante' : 'variantes'} · Ver SKU y stock</summary>
    <div className="mt-3 grid gap-2">{product.variants.map(variant => {
      const isSelected = (selectedVariantByProduct[product.id] ?? product.variants[0]?.id) === variant.id;
      return <button
        key={variant.id}
        type="button"
        onClick={() => setSelectedVariantByProduct((current) => ({ ...current, [product.id]: variant.id }))}
        aria-pressed={isSelected}
        className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer ${isSelected ? 'border-[var(--primary)] bg-white ring-1 ring-[var(--primary)]/20' : 'border-transparent bg-[var(--muted)] hover:border-slate-300'}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="break-all font-mono text-xs font-semibold">{variant.sku}</span><Badge variant={stockState(variant.stock).badge}>{variant.stock} uds</Badge></div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{variantAttributes(variant)}</p>
        <p className="mt-1 text-xs font-semibold">{formatPrice(variant.price)} {variant.comparePrice !== undefined && variant.comparePrice > variant.price && <span className="ml-1 font-normal line-through text-[var(--muted-foreground)]">{formatPrice(variant.comparePrice)}</span>}</p>
      </button>;
    })}</div>
  </details>
  const renderImage = (product: AdminProduct) => product.images[0]
    ? <img src={product.images[0]} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover bg-[var(--muted)]" />
    : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--muted)] text-[var(--muted-foreground)]"><Icon name="box" className="h-6 w-6" /></span>

  return <div className="commercial-section space-y-5">
    {error && <Alert variant="error">{error}</Alert>}
    {successMessage && <div role="status"><Alert variant="success">{successMessage}</Alert></div>}
    <section aria-label="Resumen del catálogo" className="catalog-overview">
      <div><span>Productos en tu catálogo</span><strong>{loading ? '—' : products.length}</strong></div>
      <div><span>Activos en la tienda</span><strong>{loading ? '—' : totalActive}</strong></div>
      <div><span>Activos con stock bajo o agotado</span><strong>{loading ? '—' : lowStock}</strong></div>
    </section>
    <section className="admin-list-panel" aria-label="Buscar productos">
      <div className="admin-list-panel-heading"><div><h3>Tu catálogo, en orden</h3><p>Encuentra un producto y administra sus precios y disponibilidad.</p></div><Icon name="box" className="h-5 w-5 text-[var(--muted-foreground)]" /></div>
      <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Input id="catalog-search" label="Buscar productos" icon={<Icon name="search" />} value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre, categoría o etiqueta" />
        <Select label="Estado" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} options={[{ value: 'all', label: 'Todos' }, { value: 'active', label: 'Activos' }, { value: 'archived', label: 'Archivados' }]} />
        <Select label="Orden" value={sort} onChange={event => setSort(event.target.value)} options={[{ value: 'active', label: 'Activos primero · más recientes' }, { value: 'recent', label: 'Más recientes' }]} />
      </div>
    </section>
    {loading && <LoadingState align="start" spacing="compact">Cargando productos reales…</LoadingState>}
    <section aria-label="Listado de productos" className="catalog-list">
      <div className="catalog-list-heading"><h3>Listado de productos</h3><span>{filtered.length} {filtered.length === 1 ? 'producto' : 'productos'}{search ? ` de ${products.length}` : ''}</span></div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[840px] text-sm text-left">
          <thead className="bg-[var(--muted)]"><tr>{['Producto', 'Precio', 'Inventario', 'Estado', 'Acciones'].map(label => <th scope="col" key={label} colSpan={label === 'Acciones' ? 2 : undefined} className="px-5 py-3 text-xs font-semibold text-[var(--muted-foreground)]">{label}</th>)}</tr></thead>
          <tbody>{filtered.map(product => {
            const stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0)
            const state = stockState(stock)
            const pricing = getDisplayedPricing(product)
            return <tr key={product.id} className="border-t border-[var(--border)] align-top hover:bg-[#fafbfe]">
              <td className="px-5 py-5"><div className="flex items-start gap-3">{renderImage(product)}<div className="min-w-0 max-w-xs"><p className="break-words font-semibold">{product.name}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{product.category}</p>{renderVariants(product)}</div></div></td>
              <td className="whitespace-nowrap px-5 py-5">{pricing.variantLabel && <p className="mb-1 text-xs font-medium text-slate-500">{pricing.variantLabel}</p>}<p className="font-semibold">{formatPrice(pricing.price)}</p>{pricing.comparePrice !== undefined && pricing.comparePrice > pricing.price && <><p className="mt-1 text-xs line-through text-[var(--muted-foreground)]">{formatPrice(pricing.comparePrice)}</p><div className="mt-2"><OfertaInfo precio={pricing.price} anterior={pricing.comparePrice} /></div></>}</td>
              <td className="px-5 py-5"><p className="mb-2 font-medium">{stock} unidades</p><Badge variant={state.badge}>{state.label}</Badge></td>
              <td className="px-5 py-5">{productStatus(product.status)}</td>
              <td className="whitespace-nowrap px-5 py-4">{renderActions(product)}</td>
              <td className="w-8 px-3 py-2.5 align-top text-right">{renderPermanentDeleteButton(product)}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      <div className="divide-y divide-[var(--border)] lg:hidden">{filtered.map(product => {
        const stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0)
        const pricing = getDisplayedPricing(product)
        return <article key={product.id} className="relative p-4 sm:p-5">
          <div className="absolute right-3 top-3">{renderPermanentDeleteButton(product)}</div>
          <div className="flex items-start gap-3 pr-8">{renderImage(product)}<div className="min-w-0 flex-1"><h4 className="break-words font-semibold">{product.name}</h4><p className="mt-1 text-xs text-[var(--muted-foreground)]">{product.category}</p><div className="mt-2">{productStatus(product.status)}</div></div></div>
          <div className="my-4 flex flex-wrap justify-between gap-3"><div><p className="text-xs text-[var(--muted-foreground)]">{pricing.variantLabel ? `Precio · ${pricing.variantLabel}` : 'Precio'}</p><p className="mt-1 font-semibold">{formatPrice(pricing.price)}</p>{pricing.comparePrice !== undefined && pricing.comparePrice > pricing.price && <p className="text-xs line-through text-[var(--muted-foreground)]">{formatPrice(pricing.comparePrice)}</p>}</div><div className="text-right"><p className="mb-1 text-xs text-[var(--muted-foreground)]">{stock} unidades</p><Badge variant={stockState(stock).badge}>{stockState(stock).label}</Badge></div></div>
          {renderVariants(product)}<div className="mt-4 border-t border-[var(--border)] pt-2">{renderActions(product)}</div>
        </article>
      })}</div>
      {vacio === 'empty' && <EmptyListState spacing="none" className="py-12" title="Aún no tienes productos" action={<Link to="/emprendedor/productos/nuevo"><Button variant="primary">Crear tu primer producto</Button></Link>}>Agrega tu primer producto para empezar a vender.</EmptyListState>}
      {vacio === 'no-results' && <EmptyListState spacing="none" className="py-12" action={<Button variant="outline" onClick={() => { setSearch(''); setStatusFilter('all') }}>Limpiar filtros</Button>}>No encontramos productos con esos filtros.</EmptyListState>}
    </section>
    <Modal
      open={!!productToDelete}
      onClose={closePermanentDeleteModal}
      title="Eliminar producto definitivamente"
      size="md"
    >
      {productToDelete && (
        <form onSubmit={handleConfirmPermanentDelete} className="space-y-4">
          {deleteModalError && <Alert variant="error">{deleteModalError}</Alert>}
          <div className="space-y-2 text-sm text-[var(--foreground)]">
            <p>
              Vas a eliminar de forma permanente <strong>{productToDelete.name}</strong> de tu catálogo. Esta acción no se puede deshacer.
            </p>
            <p className="rounded-lg bg-[var(--muted)] px-3 py-2.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
              La información de ventas, pedidos realizados, montos recaudados y reportes asociados a este producto se conservarán intactos.
            </p>
          </div>
          <Input
            id="confirm-permanent-delete-input"
            label='Escribe "eliminar" para confirmar'
            value={deleteConfirmInput}
            onChange={(event) => setDeleteConfirmInput(event.target.value)}
            placeholder="eliminar"
            autoComplete="off"
            autoFocus
            disabled={permanentlyDeleting}
          />
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={closePermanentDeleteModal}
              disabled={permanentlyDeleting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={!canConfirmPermanentDelete || permanentlyDeleting}
            >
              {permanentlyDeleting ? "Eliminando..." : "Eliminar definitivamente"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
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
  if (id !== "nuevo" && (loading || (loaded && loaded.id !== id))) return <LoadingState align="start" spacing="compact">Cargando producto real…</LoadingState>
  if (id !== "nuevo" && !loaded) return <Alert variant="error">{loadError || "Producto no encontrado"}. <Link to="/emprendedor/productos">Volver al catálogo real</Link></Alert>
  return <ProductEditor key={id} initial={loaded ?? blankProduct()} editing={id !== "nuevo"} />
}

export function ProductEditor({ initial, editing }: { initial: AdminProduct; editing: boolean }) {
  const navigate = useNavigate(); const imageInput = useRef<HTMLInputElement>(null)
  const savingRequest = useRef(false)
  const [activeTab, setActiveTab] = useState("info"); const [saved, setSaved] = useState(false); const [saving, setSaving] = useState(false)
  const [product, setProduct] = useState<AdminProduct>({ ...initial, images: [...initial.images], variants: initial.variants.map((variant) => ({ ...variant, attributes: { ...variant.attributes } })), attributes: { ...initial.attributes }, tags: [...initial.tags] })
  const [error, setError] = useState("");
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const uploadedVideoRef = useRef<{ file: File; id: string } | null>(null);
  const permanentDeletingRef = useRef(false);
  const [permanentlyDeleting, setPermanentlyDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleteModalError, setDeleteModalError] = useState("");

  const openPermanentDeleteModal = () => {
    if (permanentDeletingRef.current) return;
    setDeleteModalOpen(true);
    setDeleteConfirmInput("");
    setDeleteModalError("");
  };
  const closePermanentDeleteModal = () => {
    if (permanentDeletingRef.current) return;
    setDeleteModalOpen(false);
    setDeleteConfirmInput("");
    setDeleteModalError("");
  };
  const handleConfirmPermanentDelete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !product.id || permanentDeletingRef.current) return;
    if (deleteConfirmInput.trim().toLowerCase() !== "eliminar") {
      setDeleteModalError('Escribe la palabra "eliminar" para confirmar.');
      return;
    }
    permanentDeletingRef.current = true;
    setPermanentlyDeleting(true);
    setDeleteModalError("");
    try {
      await permanentDeleteCatalogProduct(product.id, deleteConfirmInput.trim());
      navigate("/emprendedor/productos", {
        replace: true,
        state: { successMessage: "Producto eliminado definitivamente. El historial de ventas se mantiene intacto." },
      });
    } catch (err) {
      setDeleteModalError(err instanceof Error ? err.message : "No se pudo eliminar definitivamente el producto.");
    } finally {
      permanentDeletingRef.current = false;
      setPermanentlyDeleting(false);
    }
  };
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
  const updateAttribute = (name: string, values: string) => {
    const options = values.split(",").map((value) => value.trim()).filter(Boolean);
    setProduct((current) => ({
      ...current,
      attributes: { ...current.attributes, [name]: options },
      variants: current.variants.map((variant) => {
        const nextAttrs = { ...variant.attributes };
        if (options.length === 0) {
          delete nextAttrs[name];
        } else if (!options.includes(nextAttrs[name] ?? "")) {
          nextAttrs[name] = options[0];
        }
        return { ...variant, attributes: nextAttrs };
      }),
    }));
  };
  const addAttribute = () => {
    let index = attributeNames.length + 1
    while (product.attributes[`Atributo ${index}`]) index++
    const name = `Atributo ${index}`
    setProduct(current => ({ ...current, attributes: { ...current.attributes, [name]: ["Opción 1"] },
      variants: current.variants.map(variant => ({ ...variant, attributes: { ...variant.attributes, [name]: "Opción 1" } })) }))
  }
  const renameAttribute = (oldName: string, newName: string) => { if (!newName.trim() || newName === oldName) return; if (product.attributes[newName]) { setError("Ya existe un atributo con ese nombre."); return; } setProduct((current) => { const attributes = { ...current.attributes }; const values = attributes[oldName]; delete attributes[oldName]; attributes[newName] = values; return { ...current, attributes, variants: current.variants.map((variant) => { const next = { ...variant.attributes, [newName]: variant.attributes[oldName] ?? values[0] ?? "" }; delete next[oldName]; return { ...variant, attributes: next } }) } }) }
  const addVariant = () => setProduct((current) => ({ ...current, variants: [...current.variants, { id: `v-${Date.now()}`, sku: generateSku(current.variants), attributes: Object.fromEntries(Object.entries(current.attributes).map(([name, values]) => [name, values[0] ?? ""])), price: current.basePrice, comparePrice: current.comparePrice, stock: 0, available: true }] }))
  const [processingImages,setProcessingImages] = useState(false)
  const processingRef = useRef(false)
  const addImages = async (files?: FileList | null) => {
    if (!files || processingRef.current) return
    processingRef.current=true; setProcessingImages(true); setError('')
    try {
      const images:string[]=[]
      for (const file of Array.from(files)) images.push(await prepareImage(file,1))
      setProduct(current=>({...current,images:[...current.images,...images]}))
    } catch(reason) { setError(reason instanceof Error?reason.message:'No pudimos procesar esta imagen.') }
    finally { processingRef.current=false;setProcessingImages(false);if(imageInput.current)imageInput.current.value='' }
  }
  const save = async () => {
    if (savingRequest.current || processingRef.current) return;
    if (!product.name.trim()) { setError("Ingresa el nombre del producto."); setActiveTab("info"); return; }
    if (product.variants.length === 0) { setError("Agrega al menos una variante con precio y stock."); setActiveTab("variants"); return; }
    if (!editing && product.comparePrice !== undefined && product.comparePrice <= product.basePrice) {
      setError("El precio anterior debe ser mayor al precio de oferta.");
      setActiveTab("info");
      return;
    }
    if (product.variants.some(v => v.comparePrice !== undefined && v.comparePrice <= v.price)) {
      setError("En las variantes con oferta, el precio anterior debe ser mayor al precio de oferta.");
      setActiveTab("variants");
      return;
    }
    const duplicatedSku = findDuplicatedSku();
    if(product.basePrice < 0 || (product.comparePrice !== undefined && product.comparePrice < 0) || product.variants.some(v => !v.sku.trim() || v.price < 0 || (v.comparePrice !== undefined && v.comparePrice < 0) || !Number.isInteger(v.stock) || v.stock < 0) || duplicatedSku) {setError(duplicatedSku ? `El SKU ${duplicatedSku} ya existe en otra variante o producto.` : "Revisa los precios, el stock entero y los SKU únicos de las variantes.");setActiveTab("variants");return;}

    const seoTitle = (product.seoTitle ?? "").trim();
    const seoDescription = (product.seoDescription ?? "").trim();
    if (seoTitle.length > 150 || seoDescription.length > 320) {
      setError("Los metadatos SEO exceden la longitud permitida (150/320 caracteres).");
      setActiveTab("seo");
      return;
    }
    const finalProduct = {
      ...product,
      basePrice: Number(product.basePrice) || 0,
      seoTitle,
      seoDescription,
    };


    savingRequest.current = true;
    setSaving(true);
    setError("");

    setSaved(false);
    try {
      let videoResourceId = finalProduct.videoResourceId ?? null;

      if (pendingVideoFile) {
        if (uploadedVideoRef.current?.file === pendingVideoFile) {
          videoResourceId = uploadedVideoRef.current.id;
        } else {
          const media = await saveProductVideoResource(
            null,
            {
              titulo: `Video de ${finalProduct.name}`.slice(0, 180),
              descripcion: '',
              tipo: 'video',
              url: '',
              activo: true
            },
            pendingVideoFile,
            false
          );

          videoResourceId = media.id;
          uploadedVideoRef.current = {
            file: pendingVideoFile,
            id: media.id
          };
        }
      }

      const productWithVideo = {
        ...finalProduct,
        videoResourceId
      };
      if (editing) {
        const persisted = await updateCatalogProduct(productWithVideo);
        setProduct(persisted);
      } else {
        const id = await createPublicProduct(productWithVideo);
        setProduct(current => ({ ...current, id }));
      }
      setSaved(true);
      navigate("/emprendedor/productos", {
        replace: true,
        state: {
          successMessage: editing
            ? "Producto actualizado correctamente."
            : "Producto creado correctamente.",
        },
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo guardar el producto.");
    } finally {
      savingRequest.current = false;
      setSaving(false);
    }
  };
  const removeImage = (index: number) => setProduct((current) => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) }))
  return <div>
    {error && <div className="mb-4"><Alert variant="error">{error}</Alert></div>}
    <div className="flex items-center justify-between mb-5 flex-wrap gap-3"><div className="flex items-center gap-3"><button onClick={() => navigate("/emprendedor/productos")} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Volver</button><h2 className="font-semibold">{editing ? "Editar producto" : "Nuevo producto"}</h2></div><div className="flex gap-2">{saved && <span className="text-sm text-[var(--success)]">✓ Guardado</span>}<Button variant="primary" size="sm" onClick={save} disabled={saving || saved || processingImages}>{saving ? "Guardando..." : "Guardar producto"}</Button></div></div>
    <Tabs tabs={[{ id: "info", label: "Información" }, { id: "variants", label: `Variantes (${variants.length})` }, { id: "images", label: `Imágenes (${product.images.length})` }, { id: "seo", label: "SEO" }]} active={activeTab} onChange={setActiveTab} />
    {activeTab === "info" && <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5"><div className="lg:col-span-2 flex flex-col gap-5"><div className="bg-white border border-[var(--border)] rounded-xl p-5 flex flex-col gap-4"><Input label="Nombre del producto" value={product.name} onChange={(event) => setField("name", event.target.value)} placeholder="Ej: Polera Esencial" required /><Textarea label="Descripción" value={product.description} onChange={(event) => setField("description", event.target.value)} placeholder="Describe el producto…" />{editing ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Precio desde</p>
                        <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">
                          {variants.length ? formatPrice(Math.min(...variants.map(v => v.price))) : "Sin variantes"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Calculado según los precios de las variantes.</p>
                      </div>
                      {(() => {
                        const cheapest = variants.length ? variants.reduce((lowest, current) => current.price < lowest.price ? current : lowest) : null;
                        return cheapest && cheapest.comparePrice !== undefined && cheapest.comparePrice > cheapest.price ? (
                          <div className="text-right flex flex-col items-end gap-1">
                            <Badge variant="success">Oferta activa</Badge>
                            <span className="text-xs text-[var(--muted-foreground)]">Antes <span className="line-through">{formatPrice(cheapest.comparePrice)}</span></span>
                          </div>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                      <p className="text-sm text-[var(--muted-foreground)]">Cada variante tiene su propio precio y stock.</p>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setActiveTab("variants")}>Editar precios →</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input label="Precio inicial (CLP)" type="number" min={0} value={product.basePrice || ""} onChange={(event) => setField("basePrice", Number(event.target.value))} placeholder="Ej: 14990" hint="Precio sugerido al añadir una variante nueva." />
                      <Input label="Precio anterior inicial (opcional)" type="number" min={0} value={product.comparePrice ?? ""} onChange={(event) => setField("comparePrice", event.target.value ? Number(event.target.value) : undefined)} placeholder="Ej: 19990" hint="Se aplica al añadir nuevas variantes." />
                    </div>
                    <OfertaInfo precio={product.basePrice} anterior={product.comparePrice} />
                  </>
                )}</div><div className="bg-white border border-[var(--border)] rounded-xl p-5"><div className="flex justify-between gap-3 mb-4"><div><p className="font-semibold text-sm">Atributos personalizados</p><p className="text-xs text-[var(--muted-foreground)]">Color, talla, material o cualquier característica.</p></div><Button variant="secondary" size="sm" onClick={addAttribute}>+ Atributo</Button></div><div className="grid gap-3">{attributeNames.map((name) => <div key={name} className="grid sm:grid-cols-2 gap-3 border-b border-[var(--border)] pb-3 last:border-0"><Input label="Nombre" defaultValue={name} onBlur={(event) => renameAttribute(name, event.target.value)} /><Input label="Opciones, separadas por coma" defaultValue={product.attributes[name].join(", ")} onBlur={(event) => updateAttribute(name, event.target.value)} /></div>)}{attributeNames.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Aún no hay atributos. Agrégalos para crear variantes combinables.</p>}</div></div></div><div className="flex flex-col gap-5"><div className="bg-white border border-[var(--border)] rounded-xl p-5 flex flex-col gap-4"><Input label="Categoría" value={product.category} onChange={(event) => setField("category", event.target.value)} /><Input label="Etiquetas" defaultValue={product.tags.join(", ")} onBlur={(event) => setField("tags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} hint="Separadas por coma" /><Toggle checked={product.featured} onChange={(featured) => setField("featured", featured)} label="Producto destacado" /></div><div className="bg-white border border-[var(--border)] rounded-xl p-5"><p className="font-semibold text-sm mb-3">Estado de publicación</p>{(["active", "archived"] as const).map((status) => <label key={status} className="flex gap-2 py-1.5 text-sm capitalize"><input type="radio" checked={product.status === status} onChange={() => setField("status", status)} />{status === "active" ? "Activo" : "Desactivado"}</label>)}</div>{editing && <div className="bg-white border border-[var(--border)] rounded-xl p-5"><p className="font-semibold text-sm mb-2">Eliminar producto</p><p className="text-xs text-[var(--muted-foreground)] mb-3">Elimina definitivamente este producto del catálogo. El historial de ventas se mantiene intacto.</p><Button variant="danger" size="sm" onClick={openPermanentDeleteModal} disabled={permanentlyDeleting}>Eliminar</Button></div>}</div></div>}
    {activeTab === "info" && <div className="mt-5 bg-white border border-[var(--border)] rounded-xl p-5">
      <p className="font-semibold text-sm mb-3">Características generales</p>
      {(product.generalAttributes ?? []).map((attribute, index) => <div key={index} className="flex flex-wrap gap-3 mb-3">
        {(["clave", "etiqueta", "valor"] as const).map(field => <Input key={field} label={field} value={attribute[field]} onChange={event => setField("generalAttributes", (product.generalAttributes ?? []).map((item, i) => i === index ? { ...item, [field]: event.target.value } : item))} />)}
        <button onClick={() => setField("generalAttributes", product.generalAttributes?.filter((_, i) => i !== index))}>Eliminar</button>
      </div>)}
      <Button onClick={() => setField("generalAttributes", [...(product.generalAttributes ?? []), { clave: "", etiqueta: "", valor: "" }])}>+ Característica</Button>
    </div>}
    {activeTab === "variants" && <div className="mt-5 bg-white border border-[var(--border)] rounded-xl p-5"><div className="flex items-start justify-between gap-3 mb-5"><div><p className="font-semibold text-sm">Variantes, SKU e inventario</p><p className="text-xs text-[var(--muted-foreground)] mt-1">Stock total: <strong>{totalStock} unidades</strong>. Cada variante mantiene precio, precio de oferta, SKU y disponibilidad propios.</p></div><Button variant="primary" size="sm" onClick={addVariant}>+ Agregar variante</Button></div>{variants.length ? <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr className="border-b border-[var(--border)]">{["SKU", "Atributos", "Precio y oferta", "Stock", "Estado", ""].map((title) => <th key={title} className="text-left py-2 px-2 text-xs text-[var(--muted-foreground)] uppercase">{title}</th>)}</tr></thead><tbody>{variants.map((variant) => <tr key={variant.id} className="border-b border-[var(--border)] last:border-0 align-top"><td className="p-2"><input aria-label="SKU de variante" className="w-28 border border-[var(--border)] rounded px-2 py-1.5 text-xs font-mono" value={variant.sku} onChange={(event) => updateVariant(variant.id, { sku: event.target.value })} /></td><td className="p-2"><div className="grid gap-1">{attributeNames.map((name) => <label key={name} className="flex items-center gap-1 text-xs"><span className="w-14 text-[var(--muted-foreground)]">{name}</span><select className="border border-[var(--border)] rounded px-1 py-1" value={variant.attributes[name] ?? ""} onChange={(event) => updateVariant(variant.id, { attributes: { ...variant.attributes, [name]: event.target.value } })}>{(product.attributes[name] ?? []).map((value) => <option key={value}>{value}</option>)}</select></label>)}</div></td><td className="p-2"><div className="flex flex-col gap-1"><label className="text-[11px] text-[var(--muted-foreground)]">Precio venta / oferta<input aria-label="Precio de venta de variante" type="number" min="0" className="block w-28 border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--foreground)] mt-0.5" value={variant.price} onChange={(event) => updateVariant(variant.id, { price: Number(event.target.value) })} /></label><label className="text-[11px] text-[var(--muted-foreground)]">Precio anterior (normal)<input aria-label="Precio anterior de variante" placeholder="Precio anterior" type="number" min="0" className="block w-28 border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--foreground)] mt-0.5" value={variant.comparePrice ?? ""} onChange={event => updateVariant(variant.id, { comparePrice: event.target.value ? Number(event.target.value) : undefined })} /></label></div><div className="mt-1.5"><OfertaInfo precio={variant.price} anterior={variant.comparePrice} /></div></td><td className="p-2"><input aria-label="Stock de variante" type="number" min="0" className="w-20 border border-[var(--border)] rounded px-2 py-1.5" value={variant.stock} onChange={(event) => updateVariant(variant.id, { stock: Number(event.target.value) })} /><div className="mt-1"><Badge variant={stockState(variant.stock).badge}>{stockState(variant.stock).label}</Badge></div></td><td className="p-2"><Badge variant={variant.stock > 0 ? "success" : "warning"}>{variant.stock > 0 ? "Con stock" : "Sin stock"}</Badge></td><td className="p-2"><button onClick={() => setProduct((current) => ({ ...current, variants: current.variants.filter((item) => item.id !== variant.id) }))} className="text-xs text-[var(--error)] hover:underline">Eliminar</button></td></tr>)}</tbody></table></div> : <Alert variant="info">Agrega atributos y crea la primera variante. Así cada combinación tendrá SKU y stock independientes.</Alert>}</div>}
    {activeTab === "images" && <div className="mt-5 bg-white border border-[var(--border)] rounded-xl p-5"><p className="font-semibold text-sm">Galería del producto</p><p className="text-xs text-[var(--muted-foreground)] mt-1 mb-4">La primera imagen es la principal. Puedes cargar JPG, PNG, WebP, HEIC o HEIF de hasta 1 MB por imagen.</p><input ref={imageInput} aria-label="Agregar imágenes del producto" type="file" accept={IMAGE_ACCEPT} disabled={processingImages} multiple className="hidden" onChange={(event) => addImages(event.target.files)} /><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{product.images.map((image, index) => <div key={`${image}-${index}`} className="relative aspect-square rounded-xl overflow-hidden border border-[var(--border)]"><img src={image} alt={`Producto ${index + 1}`} className="w-full h-full object-cover" />{index === 0 && <span className="absolute top-2 left-2"><Badge variant="info">Principal</Badge></span>}<button onClick={() => removeImage(index)} className="absolute bottom-2 right-2 bg-white rounded-md px-2 py-1 text-xs text-[var(--error)] shadow">Eliminar</button></div>)}<button disabled={processingImages} onClick={() => imageInput.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--muted)] transition-colors flex flex-col items-center justify-center gap-2"><span className="text-2xl">＋</span><span className="text-xs">{processingImages?'Procesando…':'Subir imágenes'}</span></button></div></div>}
    {activeTab === "images" && (
      <ProductVideoField
        file={pendingVideoFile}
        onChange={setPendingVideoFile}
        savedResourceId={product.videoResourceId}
        onRemoveSaved={() => {
          setProduct(current => ({ ...current, videoResourceId: null }));
        }}
      />
    )}
    {activeTab === "seo" && (
      <div className="mt-5 bg-white border border-[var(--border)] rounded-xl p-5 max-w-2xl grid gap-4">
        <div>
          <h3 className="font-semibold text-sm">SEO y motores de búsqueda</h3>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Personaliza cómo aparece este producto en Google, redes sociales y pestañas del navegador.
          </p>
        </div>
        <Input
          label="Meta título del producto"
          value={product.seoTitle ?? ""}
          maxLength={150}
          onChange={(event) => setField("seoTitle", event.target.value)}
          placeholder={product.name || "Ej: Polera Esencial de Algodón"}
          hint={`${(product.seoTitle ?? "").length}/150 caracteres (recomendado: 50-70)`}
        />
        <Textarea
          label="Meta descripción del producto"
          value={product.seoDescription ?? ""}
          maxLength={320}
          rows={3}
          onChange={(event) => setField("seoDescription", event.target.value)}
          placeholder={product.description ? product.description.slice(0, 160) : "Descripción breve para buscadores..."}
          hint={`${(product.seoDescription ?? "").length}/320 caracteres (recomendado: 120-160)`}
        />
        <div className="bg-gray-50 border border-[var(--border)] rounded-lg p-3 grid gap-1 text-sm">
          <span className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Vista previa en Google</span>
          <span className="text-xs text-[#202124] truncate">mitienda.cl › productos › {product.name || "producto"}</span>
          <span className="text-[#1a0dab] font-medium text-base truncate">
            {product.seoTitle || product.name || "Título del producto"}
          </span>
          <span className="text-xs text-[#4d5156] line-clamp-2">
            {product.seoDescription || product.description || "Descripción breve para resultados de búsqueda de motores como Google."}
          </span>
        </div>
        <Alert variant="info">Estos datos se muestran en resultados de búsqueda y no modifican el texto de tu producto.</Alert>
      </div>
    )}
    <Modal
      open={deleteModalOpen}
      onClose={closePermanentDeleteModal}
      title="Eliminar producto definitivamente"
      size="sm"
    >
      <form onSubmit={handleConfirmPermanentDelete} className="grid gap-4">
        <p className="text-sm text-[var(--muted-foreground)]">
          Esta acción eliminará de forma permanente <strong className="text-[var(--foreground)]">{product.name || "este producto"}</strong> del catálogo.
        </p>
        <p className="text-xs text-[var(--muted-foreground)] rounded-lg bg-[var(--muted)] p-3">
          Los pedidos, montos e informes de ventas históricos asociados a este producto se mantendrán intactos.
        </p>
        <Input
          label='Escribe "eliminar" para confirmar'
          value={deleteConfirmInput}
          onChange={(event) => {
            setDeleteConfirmInput(event.target.value);
            if (deleteModalError) setDeleteModalError("");
          }}
          placeholder="eliminar"
          autoFocus
        />
        {deleteModalError && <Alert variant="error">{deleteModalError}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={closePermanentDeleteModal} disabled={permanentlyDeleting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="danger"
            size="sm"
            disabled={permanentlyDeleting || deleteConfirmInput.trim().toLowerCase() !== "eliminar"}
          >
            {permanentlyDeleting ? "Eliminando..." : "Eliminar definitivamente"}
          </Button>
        </div>
      </form>
    </Modal>
  </div>
}
