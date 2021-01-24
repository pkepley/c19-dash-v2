# coding: utf-8
import pandas as pd

pivot_cols = [
    'UID', 'iso2', 'iso3', 'code3', 'FIPS', 'Admin2',
    'Province_State', 'Country_Region', 'Lat', 'Long_',
    'Combined_Key'
]


def wide_to_long(df_wide, metric_name, pivot_cols=pivot_cols, drop_cols=[]):
    df_long = pd.melt(
        df_wide.drop(columns=drop_cols),
        id_vars=pivot_cols,
        value_name=metric_name,
        var_name='report_date'
    )

    df_long = df_long.rename(
        columns={'Province_State': 'state'}
    )

    df_long['report_date'] = pd.to_datetime(
        df_long['report_date'],
        format='%m/%d/%y'
    )

    df_long = (
        df_long[['state', 'report_date', metric_name]]
        .groupby(['state', 'report_date'])
        .sum()
        .reset_index()
    )

    df_long[f'{metric_name}_daily'] = (
        df_long.groupby('state')[metric_name]
        .diff()
        .fillna(0)
        .astype('int')
    )

    return df_long


def rename_and_filter_states(df_target, df_state_names):
    # original column ordering
    column_ordering = df_target.columns

    # join abbreviation and only keep the states we use
    df_target = pd.merge(
        df_target,
        df_state_names[['state_name', 'state_abbrev']],
        how='inner',
        left_on='state',
        right_on='state_name'
    )

    df_target = (
        df_target
        .drop(columns=['state'])
        .rename(columns={'state_abbrev': 'state'})
    )

    df_target = df_target[column_ordering]
    
    return df_target


if __name__ == '__main__':
    from data_config import data_input_dir, data_output_dir

    # ----------------- pivot the confirmed dataframe ------------------
    df_confirmed_wide = pd.read_csv(
        f'{data_input_dir}/time_series_covid19_confirmed_US.csv'
    )

    df_confirmed_long = wide_to_long(
        df_confirmed_wide,
        'confirmed'
    )
    del df_confirmed_wide

    # ----------------- pivot the deaths dataframe ------------------
    df_deaths_wide = pd.read_csv(
        f'{data_input_dir}/time_series_covid19_deaths_US.csv'
    )

    df_deaths_long = wide_to_long(
        df_deaths_wide,
        'deaths',
        drop_cols=['Population']
    )

    # extract the population table
    df_population = (
        df_deaths_wide[['Province_State', 'Population']]
        .rename(columns={'Province_State': 'state', 'Population': 'population'})
        .groupby('state')
        .sum()
        .reset_index()
    )

    del df_deaths_wide        

    # combine confirmed and deaths dataframes
    df_us_covid_cases = pd.merge(
        df_confirmed_long,
        df_deaths_long,
        on=['state', 'report_date']
    )

    # ------- use state abbreviations in the final frames ------
    df_state_names = pd.read_csv(
        './state_mapping.csv'
    )

    df_us_covid_cases = rename_and_filter_states(
        df_us_covid_cases,
        df_state_names
    )            

    df_population = rename_and_filter_states(
        df_population,
        df_state_names
    )            

    df_us_covid_cases.to_csv(
        f'{data_output_dir}/us_covid_cases.csv',
        index=False
    )

    df_population.to_csv(
        f'{data_output_dir}/us_population.csv',
        index=False
    )
