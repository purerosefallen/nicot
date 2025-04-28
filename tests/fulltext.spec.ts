import { IdBase } from '../src/bases';
import { NotQueryable, QueryFullText, StringColumn } from '../src/decorators';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { CrudService } from '../src/crud-base';
import { Entity } from 'typeorm';
import { Injectable } from '@nestjs/common';

@Entity()
class Article extends IdBase() {
  @NotQueryable()
  @StringColumn(100)
  name: string;

  @QueryFullText({
    parser: 'zhparser',
  })
  @StringColumn(10000)
  chineseContent: string;

  @QueryFullText({
    configuration: 'english',
  })
  @StringColumn(10000)
  englishContent: string;
}

@Injectable()
class ArticleService extends CrudService(Article) {
  constructor(@InjectRepository(Article) repo) {
    super(repo);
  }
}

/*
describe('fulltext', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          dropSchema: true,
          synchronize: true,
          autoLoadEntities: true,
          entities: [],
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          password: 'postgres',
          database: 'postgres',
          logging: true,
        }),
        TypeOrmModule.forFeature([Article, ArticleService]),
      ],
      providers: [ArticleService],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  it('should filter Chinese fulltext', async () => {
    const articleService = app.get(ArticleService);
    const article = new Article();
    article.name = '今日说法';
    article.chineseContent = '今天天气不错，适合出去玩。';
    await articleService.repo.save(article);
    const correctQuery = await articleService.findAll({
      chineseContent: '天气',
    });

    expect(correctQuery.data).toHaveLength(1);
    expect(correctQuery.data[0].name).toBe('今日说法');

    const incorrectQuery = await articleService.findAll({
      chineseContent: '气候',
    });
    expect(incorrectQuery.data).toHaveLength(0);

    const queryForTwoWords = await articleService.findAll({
      chineseContent: '今天 不错',
    });
    expect(queryForTwoWords.data).toHaveLength(1);

    const queryForTwoWordsWithDifferentOrder = await articleService.findAll({
      chineseContent: '不错 今天',
    });
    expect(queryForTwoWordsWithDifferentOrder.data).toHaveLength(1);

    const queryForcedCorrect = await articleService.findAll({
      chineseContent: '"今天天气"',
    });
    expect(queryForcedCorrect.data).toHaveLength(1);


    const queryWithPunctuation = await articleService.findAll({
      chineseContent: '今天天气不错。',
    });
    expect(queryWithPunctuation.data).toHaveLength(1);

    const queryWithPunctuationIncorrect = await articleService.findAll({
      chineseContent: '今天天气不错！',
    });
    expect(queryWithPunctuationIncorrect.data).toHaveLength(0);
  });

  it('should filter English fulltext', async () => {
    const articleService = app.get(ArticleService);
    const article = new Article();
    article.name = "Today's Law";
    article.englishContent =
      'The weather is nice today, suitable for going out.';
    await articleService.repo.save(article);
    const correctQuery = await articleService.findAll({
      englishContent: 'weather',
    });

    expect(correctQuery.data).toHaveLength(1);
    expect(correctQuery.data[0].name).toBe("Today's Law");

    const incorrectQuery = await articleService.findAll({
      englishContent: 'climate',
    });
    expect(incorrectQuery.data).toHaveLength(0);

    const queryForTwoWords = await articleService.findAll({
      englishContent: 'weather nice',
    });
    expect(queryForTwoWords.data).toHaveLength(1);

    const queryForTwoWordsWithDifferentOrder = await articleService.findAll({
      englishContent: 'nice weather',
    });
    expect(queryForTwoWordsWithDifferentOrder.data).toHaveLength(1);

    const queryForcedCorrect = await articleService.findAll({
      englishContent: '"The weather"',
    });

    expect(queryForcedCorrect.data).toHaveLength(1);

    const queryForcedIncorrect = await articleService.findAll({
      englishContent: '"weather nice"',
    });
    expect(queryForcedIncorrect.data).toHaveLength(0);

    const queryWithPunctuation = await articleService.findAll({
      englishContent: 'The weather is nice today.',
    });
    expect(queryWithPunctuation.data).toHaveLength(1);
  });
});
*/
