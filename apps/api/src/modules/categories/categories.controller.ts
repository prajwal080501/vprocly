import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../identity-tenancy/index.js';
import { CategoryResolverService } from './category-resolver.service.js';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly resolver: CategoryResolverService) {}

  /** Curated marketplace categories for buyer entry, supplier onboarding, and workbook validation. Dynamic
   *  resolver-created categories remain available internally but are not mixed into selection controls. */
  @Get()
  @Public()
  list() {
    return this.resolver.list();
  }

  /** Type-ahead: "does something close to this already exist" -- read-only, never creates a category. */
  @Get('suggest')
  @Public()
  suggest(@Query('q') q?: string) {
    return this.resolver.suggest(q ?? '');
  }
}
