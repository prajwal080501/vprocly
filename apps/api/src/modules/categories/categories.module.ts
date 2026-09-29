import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller.js';
import { CategoryResolverService } from './category-resolver.service.js';

@Module({
  controllers: [CategoriesController],
  providers: [CategoryResolverService],
  exports: [CategoryResolverService],
})
export class CategoriesModule {}
