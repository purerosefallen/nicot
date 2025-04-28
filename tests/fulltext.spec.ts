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
    orderBySimilarity: true,
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

  it('should order by similarity', async () => {
    const articleService = app.get(ArticleService);

    // 插入数据，控制关键词密度
    const articles = [
      {
        name: 'Weather Blast',
        englishContent: 'Weather weather weather everywhere today!',
      },
      {
        name: 'Perfect Weather',
        englishContent: 'The weather is absolutely perfect today.',
      },
      {
        name: 'Nice Day',
        englishContent: 'It is a nice day with sunny skies.',
      },
      {
        name: 'Random News',
        englishContent: 'The stock market fluctuated wildly today.',
      },
    ];

    await articleService.repo.save(
      articles.map((a) => Object.assign(new Article(), a)),
    );

    // 搜索关键词
    const result = await articleService.findAll({
      englishContent: 'weather',
    });

    console.log(
      'Order by similarity:',
      result.data.map((d) => d.name),
    );

    // 验证顺序（根据匹配度高低）
    expect(result.data.length).toBe(2); // 只搜到了2条有关weather的
    expect(result.data[0].name).toBe('Weather Blast'); // 多次出现，应排第一
    expect(result.data[1].name).toBe('Perfect Weather'); // 出现一次，应排第二

    // 验证其他无关的文章没有被搜到
    const names = result.data.map((d) => d.name);
    expect(names).not.toContain('Nice Day');
    expect(names).not.toContain('Random News');
  });
});
*/
