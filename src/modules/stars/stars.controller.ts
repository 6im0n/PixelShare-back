import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/current-user.decorator';
import type { AuthUser } from '../../shared/types';
import { SetStarDto } from './dto/stars.dto';
import { StarsService } from './stars.service';

@ApiBearerAuth()
@ApiTags('stars')
@Controller()
export class StarsController {
  constructor(private readonly stars: StarsService) {}

  @Put('photos/:id/stars')
  setStar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetStarDto,
  ) {
    return this.stars.setStar(id, user, dto.value);
  }

  @Get('photos/:id/stars')
  listForPhoto(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.stars.listForPhoto(id, user);
  }

  @Get('libraries/:libraryId/stars')
  listForLibrary(
    @Param('libraryId', ParseUUIDPipe) libraryId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stars.listForLibrary(libraryId, user);
  }

  @Get('photos/:id/history')
  listHistory(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.stars.listHistoryForPhoto(id, user);
  }

  @Delete('libraries/:libraryId/stars/me')
  clearMine(
    @Param('libraryId', ParseUUIDPipe) libraryId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stars.clearMineForLibrary(libraryId, user);
  }
}
