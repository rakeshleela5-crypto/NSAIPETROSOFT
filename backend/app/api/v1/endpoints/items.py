from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.item import Item
from app.schemas.item import ItemCreate, ItemResponse

router = APIRouter()


@router.get("/", response_model=List[ItemResponse], summary="List Items")
async def list_items(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    query = select(Item).offset(skip).limit(limit).order_by(Item.created_at.desc())
    result = await db.execute(query)
    items = result.scalars().all()
    return items


@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED, summary="Create Item")
async def create_item(
    item_in: ItemCreate,
    db: AsyncSession = Depends(get_db),
):
    item = Item(title=item_in.title, description=item_in.description)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/{item_id}", response_model=ItemResponse, summary="Get Item by ID")
async def get_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
):
    query = select(Item).where(Item.id == item_id)
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item with id {item_id} not found",
        )
    return item
