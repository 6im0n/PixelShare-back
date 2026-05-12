import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { CurrentUser } from '../../shared/current-user.decorator';
import type { AuthUser } from '../../shared/types';
import { PhotosService } from './photos.service';

@ApiBearerAuth()
@ApiTags('photos')
@Controller()
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get('libraries/:libraryId/photos')
  list(
    @Param('libraryId', ParseUUIDPipe) libraryId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.photos.listByLibrary(libraryId, user);
  }

  @Post('libraries/:libraryId/photos')
  async upload(
    @Param('libraryId', ParseUUIDPipe) libraryId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ) {
    const file = await req.file();
    if (!file) throw new BadRequestException('multipart file required');
    const buffer = await file.toBuffer();
    return this.photos.upload(libraryId, user, {
      buffer,
      originalName: file.filename,
    });
  }

  @Delete('photos/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.photos.remove(id, user);
  }

  @Get('photos/:id/thumbnail')
  @Header('Cache-Control', 'private, max-age=3600')
  async thumbnail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { buffer, mime } = await this.photos.readFileForUser(id, user, 'thumbnail');
    res.header('content-type', mime);
    return new StreamableFile(Readable.from(buffer));
  }

  @Get('photos/:id/original')
  async original(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { buffer, mime, name } = await this.photos.readFileForUser(id, user, 'original');
    res.header('content-type', mime);
    res.header('content-disposition', contentDisposition(name));
    return new StreamableFile(Readable.from(buffer));
  }
}

function contentDisposition(name: string): string {
  const asciiFallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
