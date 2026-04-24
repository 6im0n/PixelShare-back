import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/current-user.decorator';
import type { AuthUser } from '../../shared/types';
import { CreateLibraryDto, GrantClientDto, UpdateLibraryDto } from './dto/libraries.dto';
import { LibrariesService } from './libraries.service';

@ApiBearerAuth()
@ApiTags('libraries')
@Controller('libraries')
export class LibrariesController {
  constructor(private readonly libraries: LibrariesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.libraries.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLibraryDto) {
    return this.libraries.create(user, dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.libraries.get(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateLibraryDto,
  ) {
    return this.libraries.update(id, user, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.libraries.remove(id, user);
  }

  @Get(':id/clients')
  listClients(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.libraries.listClients(id, user);
  }

  @Post(':id/clients')
  grantClient(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: GrantClientDto,
  ) {
    return this.libraries.grantClient(id, dto.clientId, user);
  }

  @Post(':id/submit-selection')
  submitSelection(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.libraries.submitSelection(id, user);
  }

  @Delete(':id/clients/:clientId')
  revokeClient(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.libraries.revokeClient(id, clientId, user);
  }
}
