import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CartItem } from '../../context/CartContext';
import { formatPrice } from '../../data/mockData';
import { StockFeedback } from './StockFeedback';
import { QuantityControl } from './QuantityControl';
import './cart-line-item.css';

export function CartLineItem({kind,label,title,media,details,status,controls,price,unitPrice,unitLabel,comparePrice,onRemove,removeLabel,disabled=false}:{kind:'product'|'activity';label:string;title:ReactNode;media:ReactNode;details:ReactNode;status?:ReactNode;controls:ReactNode;price:number;unitPrice:number;unitLabel:string;comparePrice?:number;onRemove:()=>unknown;removeLabel:string;disabled?:boolean}) {
  return <article data-page-panel data-cart-kind={kind} className="cart-line-item">
    <div className="cart-line-media">{media}</div>
    <div className="cart-line-content">
      <header className="cart-line-header"><div className="cart-line-description"><p className="cart-line-kind">{label}</p><h2 className="cart-line-title">{title}</h2><div className="cart-line-details">{details}</div></div><button type="button" data-page-action="danger" className="cart-line-remove paid-cart-remove" aria-label={removeLabel} disabled={disabled} onClick={onRemove}>×</button></header>
      {status}
      <div className="cart-line-bottom"><div className="cart-line-controls">{controls}</div><div className="cart-line-price"><strong data-page-price>{formatPrice(price)}</strong><small>{formatPrice(unitPrice)} por {unitLabel}</small>{comparePrice&&<del>{formatPrice(comparePrice)}</del>}</div></div>
    </div>
  </article>;
}

export function CartProductRow({item,route,onRemove,onQuantity}:{item:CartItem;route:(path:string)=>string;onRemove:()=>unknown;onQuantity:(quantity:number)=>unknown}) {
  return <CartLineItem kind="product" label="Producto" title={<Link to={route(`producto/${item.productId}`)}>{item.name}</Link>} media={<Link to={route(`producto/${item.productId}`)} aria-label={item.name}>{item.image?<img data-page-item-image src={item.image} alt="" onError={event=>{event.currentTarget.style.display='none';}}/>:<span aria-hidden="true">□</span>}</Link>} details={<><p>{Object.entries(item.attributes).map(([key,value])=>`${key}: ${value}`).join(' · ')}{Object.keys(item.attributes).length?' · ':''}SKU: {item.sku}</p><StockFeedback sku={item.sku} maxStock={item.maxStock} quantity={item.quantity}/></>} controls={<><span className="cart-line-label">Unidades</span><QuantityControl className="cart-line-quantity" value={item.quantity} allowRemoval onDecrease={()=>onQuantity(item.quantity-1)} onIncrease={()=>onQuantity(item.quantity+1)} increaseDisabled={item.quantity>=item.maxStock}/></>} price={item.price*item.quantity} unitPrice={item.price} unitLabel="unidad" comparePrice={item.comparePrice?item.comparePrice*item.quantity:undefined} onRemove={onRemove} removeLabel={`Eliminar ${item.name}`}/>;
}
